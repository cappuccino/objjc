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
    constructor(node, name, superclassNode, superclassDef, category, ivars, instanceMethods, classMethods, protocols)
    {
        this.node = node;
        this.name = name;

        if (superclassNode)
        {
            this.superclassNode = superclassNode;
            this.superclassDef = superclassDef;
        }

        this.category = category;
        this.ivars = ivars;
        this.instanceMethods = instanceMethods;
        this.classMethods = classMethods;
        this.protocols = protocols;
    }

    addIvar(name, def)
    {
        if (!this.ivars)
            this.ivars = Object.create(null);

        this.ivars[name] = def;
    }

    addInstanceMethod(methodDef)
    {
        if (!this.instanceMethods)
            this.instanceMethods = Object.create(null);

        this.instanceMethods[methodDef.name] = methodDef;
    }

    addClassMethod(methodDef)
    {
        if (!this.classMethods)
            this.classMethods = Object.create(null);

        this.classMethods[methodDef.name] = methodDef;
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
                        results.push(
                            {
                                methodDef: requiredMethods[methodName],
                                protocolDef
                            }
                        );
                }
            }
        }

        if (protocolDef.protocols)
        {
            for (const protocol of protocolDef.protocols)
                results = results.concat(this.unimplementedMethodsForProtocol(protocol));
        }

        return results;
    }

    getIvar(name)
    {
        return this.ivars ? this.ivars[name] : null;
    }

    getMethod(name, type)
    {
        const methods = type === ClassDef.instanceMethodType ? this.instanceMethods : this.classMethods;

        if (methods)
        {
            const method = methods[name];

            if (method)
                return method;
        }

        if (this.superclassDef)
            return this.superclassDef.getMethod(name, type);

        return null;
    }

    getInstanceMethod(name)
    {
        return this.getMethod(name, ClassDef.instanceMethodType);
    }

    getOwnInstanceMethod(name)
    {
        return this.instanceMethods ? this.instanceMethods[name] : null;
    }

    getClassMethod(name)
    {
        return this.getMethod(name, ClassDef.classMethodType);
    }

    getOwnClassMethod(name)
    {
        return this.classMethods ? this.classMethods[name] : null;
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

    // Return a new Array with all instance methods, including inherited
    getInstanceMethods()
    {
        return this.getMethods(ClassDef.instanceMethodType);
    }

    // Return a new Array with all class methods, including inherited
    getClassMethods()
    {
        return this.getMethods(ClassDef.classMethodType);
    }
}

ClassDef.instanceMethodType = 1;
ClassDef.classMethodType = 1;

exports.ClassDef = ClassDef;

class ProtocolDef
{
    constructor(node, name, protocols, requiredInstanceMethodDefs, requiredClassMethodDefs)
    {
        this.node = node;
        this.name = name;
        this.protocols = protocols;
        this.requiredInstanceMethods = requiredInstanceMethodDefs || Object.create(null);
        this.requiredClassMethods = requiredClassMethodDefs || Object.create(null);
    }

    addInstanceMethod(methodDef)
    {
        this.requiredInstanceMethods[methodDef.name] = methodDef;
    }

    addClassMethod(methodDef)
    {
        this.requiredClassMethods[methodDef.name] = methodDef;
    }

    getMethod(name, methods)
    {
        let method;

        if (methods)
        {
            method = methods[name];

            if (method)
                return method;
        }

        const protocols = this.protocols;

        for (const protocol of protocols)
        {
            method = protocol.getMethod(name, methods);

            if (method)
                return method;
        }

        return null;
    }

    getInstanceMethod(name)
    {
        return this.getMethod(name, this.requiredInstanceMethods);
    }

    getOwnInstanceMethod(name)
    {
        return this.requiredInstanceMethods[name];
    }

    getClassMethod(name)
    {
        return this.getMethod(name, this.requiredClassMethods);
    }

    getOwnClassMethod(name)
    {
        return this.requiredClassMethods[name];
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
