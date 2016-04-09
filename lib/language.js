"use strict";

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
        this.node = node;
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

    /**
     * @param {ProtocolDef} protocolDef - A protocol to match against this class.
     * @returns {[{ methodDef:MethodDef, protocol:ProtocolDef }]} - List of unimplemented methods and the protocol
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

            const implementedMethods = this.getMethods(methodSource.type);

            for (const entry of requiredMethods)
            {
                if (!(implementedMethods.has(entry[0])))
                {
                    results.push(
                        {
                            methodDef: entry[1],
                            protocolDef
                        }
                    );
                }
            }
        }

        if (protocolDef.inheritedProtocols)
        {
            for (const protocol of protocolDef.inheritedProtocols)
                results = results.concat(this.unimplementedMethodsForProtocol(protocol));
        }

        return results;
    }

    getIvar(name)
    {
        return this.ivars.get(name);
    }

    getMethod(name, type, dontSearchProtocols)
    {
        let classDef = this;

        do
        {
            let methods = type === ClassDef.InstanceMethodType ? classDef.instanceMethods : classDef.classMethods,
                method = methods.get(name);

            if (method)
                return method;

            if (!dontSearchProtocols)
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

    getInstanceMethod(name)
    {
        return this.getMethod(name, ClassDef.InstanceMethodType);
    }

    getOwnInstanceMethod(name)
    {
        return this.instanceMethods.get(name);
    }

    getClassMethod(name)
    {
        return this.getMethod(name, ClassDef.ClassMethodType);
    }

    getOwnClassMethod(name)
    {
        return this.classMethods.get(name);
    }

    /**
     * @param {int} type - ClassDef.InstanceMethodType || ClassDef.ClassMethodType
     * @returns {Map} - A { methodName, MethodDef } map of all methods implemented by this class
     * and its superclasses.
     */
    getMethods(type)
    {
        const
            methods = type === ClassDef.InstanceMethodType ? this.instanceMethods : this.classMethods,
            returnObject = new Map();

        if (methods.size)
        {
            if (this.superclassDef)
            {
                const superclassMethods = this.superclassDef.getMethods(type);

                for (const entry of superclassMethods)
                    returnObject.set(entry[0], entry[1]);
            }

            for (const entry of methods)
                returnObject.set(entry[0], entry[1]);
        }

        return returnObject;
    }
}

ClassDef.InstanceMethodType = 1;
ClassDef.ClassMethodType = 2;

exports.ClassDef = ClassDef;

class ProtocolDef
{
    constructor(node, name, inheritedProtocols)
    {
        this.node = node;
        this.name = name;
        this.inheritedProtocols = inheritedProtocols;
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

    getMethod(name, type)
    {
        const
            methodType = type === ClassDef.InstanceMethodType ? "InstanceMethods" : "ClassMethods",
            protocols = [this, ...this.inheritedProtocols];

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
        this.node = node;
        this.name = name;
        this.types = types;
    }
}

exports.MethodDef = MethodDef;

class TypeDef
{
    constructor(node, name)
    {
        this.node = node;
        this.name = name;
    }
}

exports.TypeDef = TypeDef;
