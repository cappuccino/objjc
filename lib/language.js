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

    unimplementedMethodsForProtocol(protocolDef)
    {
        let results = [],
            methodSources = [
                {
                    required: protocolDef.requiredInstanceMethods,
                    type: ClassDef.instanceMethodType
                },
                {
                    required: protocolDef.requiredClassMethods,
                    type: ClassDef.classMethodType
                }
            ];

        for (const methodSource of methodSources)
        {
            const requiredMethods = methodSource.required;

            if (requiredMethods)
            {
                const implementedMethods = this.getMethods(methodSource.type);

                for (const methodName in requiredMethods)
                {
                    if (!(methodName in implementedMethods))
                    {
                        results.push(
                            {
                                methodDef: requiredMethods[methodName],
                                protocolDef
                            }
                        );
                    }
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
            let methods = type === ClassDef.instanceMethodType ? classDef.instanceMethods : classDef.classMethods,
                method = methods.get(name);

            if (method)
                return method;

            if (!dontSearchProtocols)
            {
                for (const protocol of classDef.protocols)
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
        return this.getMethod(name, ClassDef.instanceMethodType);
    }

    getOwnInstanceMethod(name)
    {
        return this.instanceMethods.get(name);
    }

    getClassMethod(name)
    {
        return this.getMethod(name, ClassDef.classMethodType);
    }

    getOwnClassMethod(name)
    {
        return this.classMethods.get(name);
    }

    getMethods(type)
    {
        const methods = type === ClassDef.instanceMethodType ? this.instanceMethods : this.classMethods;

        if (methods)
        {
            const returnObject = Object.create(null);

            if (this.superclassDef)
            {
                const superclassMethods = this.superclassDef.getMethods(type);

                for (const methodName in superclassMethods)
                    returnObject[methodName] = superclassMethods[methodName];
            }

            for (const methodName in methods)
                returnObject[methodName] = methods[methodName];

            return returnObject;
        }

        return Object.create(null);
    }
}

ClassDef.instanceMethodType = 1;
ClassDef.classMethodType = 1;

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
            methodType = type === ClassDef.instanceMethodType ? "InstanceMethods" : "ClassMethods",
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
        return this.getMethod(name, ClassDef.instanceMethodType);
    }

    getOwnInstanceMethod(name)
    {
        return this.requiredInstanceMethods.get(name) || this.optionalInstanceMethods.get(name);
    }

    getClassMethod(name)
    {
        return this.getMethod(name, ClassDef.classMethodType);
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
