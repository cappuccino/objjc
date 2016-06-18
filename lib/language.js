"use strict";

const utils = require("./utils.js");

/*
    Both ClassDef and ProtocolDef conform to a 'protocol' (that we can't declare in Javascript).
    Both have the attribute 'protocols': Array of ProtocolDef that they conform to.
    Both also have the functions: addInstanceMethod, addClassMethod, getInstanceMethod and getClassMethod
    classDef = {
        "className": aClassName,
        "superClass": superClass ,
        "ivars": myIvars,
        "instanceMethods": instanceMethodDefs,
        "classMethods": classMethodDefs,
        "protocols": myProtocols
    };
*/

const ClassDefTypes = { // jscs: ignore requireMultipleVarDecl
    implementation: 1,
    class: 2
};

exports.ClassDefTypes = ClassDefTypes;

class ClassDef
{
    constructor(node, name, superclassNode, superclassDef, category)
    {
        this.node = utils.copyNode(node);
        this.name = name;

        if (superclassNode)
        {
            this.superclassNode = superclassNode;
            this.superclassDef = superclassDef;
        }

        this.category = category;
        this.ivars = new Map();
        this.instanceMethods = new Map();
        this.classMethods = new Map();
        this.protocols = new Map();
    }

    addIvar(name, def)
    {
        this.ivars.set(name, def);
    }

    addInstanceMethod(methodDef)
    {
        this.instanceMethods.set(methodDef.name, methodDef);
    }

    addClassMethod(methodDef)
    {
        this.classMethods.set(methodDef.name, methodDef);
    }

    addProtocol(protocolDef)
    {
        this.protocols.set(protocolDef.name, protocolDef);
    }

    // Get the set of all protocols this class adopts, along with all of the protocols
    // those protocols incorporate.
    getAdoptedProtocols(protocols)
    {
        for (const protocol of this.protocols.values())
        {
            protocols.add(protocol);
            protocol.getIncorporatedProtocols(protocols);
        }

        return protocols;
    }

    /**
     * Check for required methods in the given protocol and its incorporated protocols that are not implemented
     * by this class or its superclasses. Protocols adopted by inherited classes are removed from consideration.
     *
     * @param {ProtocolDef} protocolDef - A protocol to match against this class.
     * @returns {[{ method:MethodDef, protocolName:String }]} - List of unimplemented methods and the protocol
     * in which the method is declared.
     */
    unimplementedMethodsForProtocol(protocolDef)
    {
        let results = [],
            methodSources = [
                {
                    required: protocolDef.requiredInstanceMethods,
                    type: ClassDef.InstanceMethodType
                },
                {
                    required: protocolDef.requiredClassMethods,
                    type: ClassDef.ClassMethodType
                }
            ];

        for (const methodSource of methodSources)
        {
            const requiredMethods = methodSource.required;

            if (requiredMethods.size === 0)
                continue;

            // First step is get a set of all of the protocols that are available for consideration.
            // We begin with protocolDef and a recursive list of all of its incorporated protocols.
            const protocols = new Set([protocolDef]);

            protocolDef.getIncorporatedProtocols(protocols);

            // Now remove any protocols that are adopted by superclasses
            let superclass = this.superclassDef;

            while (superclass)
            {
                const superclassProtocols = new Set();

                for (const protocol of superclass.getAdoptedProtocols(superclassProtocols))
                    protocols.delete(protocol);

                superclass = superclass.superclassDef;
            }

            // Now we have the set of protocolDefs whose required methods should be checked for implementation
            // in this class or any superclasses.
            for (const protocol of protocols)
            {
                const methods = methodSource.type === ClassDef.InstanceMethodType ?
                                protocol.requiredInstanceMethods :
                                protocol.requiredClassMethods;

                for (const entry of methods)
                {
                    const
                        name = entry[0],
                        methodDef = entry[1],
                        implementedMethod = this.getMethod(name, methodSource.type, true);

                    if (!implementedMethod)
                    {
                        results.push({
                            method: methodDef,
                            protocolName: protocol.name
                        });
                    }
                }
            }
        }

        return results;
    }

    getIvar(name)
    {
        return this.ivars.get(name);
    }

    getMethod(name, type, dontCheckProtocols)
    {
        let classDef = this;

        do
        {
            let methods = type === ClassDef.InstanceMethodType ? classDef.instanceMethods : classDef.classMethods,
                method = methods.get(name);

            if (method)
                return method;

            if (!dontCheckProtocols)
            {
                for (const protocol of classDef.protocols.values())
                {
                    method = protocol.getMethod(name, type);

                    if (method)
                        return method;
                }
            }

            classDef = classDef.superclassDef;
        }
        while (classDef);

        return null;
    }

    getInstanceMethod(name, dontCheckProtocols)
    {
        return this.getMethod(name, ClassDef.InstanceMethodType, dontCheckProtocols);
    }

    getOwnInstanceMethod(name)
    {
        return this.instanceMethods.get(name);
    }

    getClassMethod(name, dontCheckProtocols)
    {
        return this.getMethod(name, ClassDef.ClassMethodType, dontCheckProtocols);
    }

    getOwnClassMethod(name)
    {
        return this.classMethods.get(name);
    }
}

ClassDef.InstanceMethodType = 1;
ClassDef.ClassMethodType = 2;

exports.ClassDef = ClassDef;

class ProtocolDef
{
    /**
     * @param {acorn.Node} node - The node that declares this protocol.
     * @param {String} name - The protocol name.
     * @param {[ProtocolDef]} incorporatedProtocols - An array of protocols this protocol conforms to.
     */
    constructor(node, name, incorporatedProtocols)
    {
        this.node = utils.copyNode(node);
        this.name = name;
        this.incorporatedProtocols = incorporatedProtocols;
        this.requiredInstanceMethods = new Map();
        this.requiredClassMethods = new Map();
        this.optionalInstanceMethods = new Map();
        this.optionalClassMethods = new Map();
    }

    addInstanceMethod(methodDef, scope)
    {
        const methods = scope.requiredProtocolMethods ? this.requiredInstanceMethods : this.optionalInstanceMethods;

        methods.set(methodDef.name, methodDef);
    }

    addClassMethod(methodDef, scope)
    {
        const methods = scope.requiredProtocolMethods ? this.requiredClassMethods : this.optionalClassMethods;

        methods.set(methodDef.name, methodDef);
    }

    // Recursively get a set of all protocols that this protocol incorporates.
    getIncorporatedProtocols(protocols)
    {
        for (const protocol of this.incorporatedProtocols)
        {
            protocols.add(protocol);
            protocol.getIncorporatedProtocols(protocols);
        }

        return protocols;
    }

    getMethod(name, type)
    {
        const
            methodType = type === ClassDef.InstanceMethodType ? "InstanceMethods" : "ClassMethods",
            protocols = [this, ...this.incorporatedProtocols];

        for (const protocol of protocols)
        {
            for (const mode of ["required", "optional"])
            {
                let methods = protocol[mode + methodType],
                    method = methods.get(name);

                if (method)
                    return method;
            }
        }

        return null;
    }

    getInstanceMethod(name)
    {
        return this.getMethod(name, ClassDef.InstanceMethodType);
    }

    getOwnInstanceMethod(name)
    {
        return this.requiredInstanceMethods.get(name) || this.optionalInstanceMethods.get(name);
    }

    getClassMethod(name)
    {
        return this.getMethod(name, ClassDef.ClassMethodType);
    }

    getOwnClassMethod(name)
    {
        return this.requiredClassMethods.get(name) || this.optionalClassMethods.get(name);
    }
}

exports.ProtocolDef = ProtocolDef;

class MethodDef
{
    constructor(node, name, types)
    {
        this.node = utils.copyNode(node);
        this.name = name;
        this.types = types;
    }
}

exports.MethodDef = MethodDef;

class TypeDef
{
    constructor(node, name)
    {
        this.node = utils.copyNode(node);
        this.name = name;
    }
}

exports.TypeDef = TypeDef;
