"use strict";

const makeTemplate = require("./utils").makeTemplate;

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

ClassDef.categoryTemplate = makeTemplate(
    "// ${data.comment}\n" +
    "var $the_class = objj_getClass(\"${data.class}\");\n" +
    "\n" +
    "if (!$the_class)\n" +
    "→throw new ReferenceError(\"Cannot find declaration for class '${data.class}'\");\n"
);

ClassDef.declarationTemplate = makeTemplate(
    "// ${data.comment}\n" +
    "var $the_class = objj_allocateClassPair(${data.superclass}, \"${data.class}\");\n"
);

ClassDef.protocolTemplate = makeTemplate(
    "${data.var}$the_protocol = objj_getProtocol(\"${data.name}\");\n" +
    "\n" +
    "if (!$the_protocol)\n" +
    "→throw new ReferenceError(\"Cannot find protocol declaration for '${data.name}'\");\n" +
    "\n" +
    "class_addProtocol($the_class, $the_protocol);\n"
);

ClassDef.getterTemplate = makeTemplate(
    "\n" +
    "// @accessors(${data.readonly}getter=${data.selector})\n" +
    "new objj_method(sel_getUid(\"${data.selector}\"),\n" +
    "function $${data.class}__${data.selector}(self, _cmd)\n" +
    "{\n" +
    "→return self.${data.ivar};\n" +
    "},\n" +
    "// argument types\n" +
    "[\"${data.returnType}\"]),"
);

ClassDef.setterTemplate = makeTemplate(
    "\n" +
    "// @accessors(${data.copy}setter=${data.setter})\n" +
    "new objj_method(sel_getUid(\"${data.selector}\"),\n" +
    "function $${data.class}__${data.setter}_(self, _cmd, newValue)\n" +
    "{\n" +
    "${data.code}\n" +
    "},\n" +
    "// argument types\n" +
    "[\"void\", \"${data.returnType}\"]),"
);

ClassDef.setterCopyTemplate = makeTemplate(
    "if (self.${data.ivar} !== newValue)\n" +
    "→self.${data.ivar} = newValue == null ? null : newValue.isa.objj_msgSend0(newValue, \"copy\");"
);

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

ProtocolDef.declarationTemplate = makeTemplate(
    "// ${data.comment}\n" +
    "var $the_protocol = objj_allocateProtocol(\"${data.name}\");\n"
);

ProtocolDef.inheritedDeclarationTemplate = makeTemplate(
    "${data.var}$the_inherited_protocol = objj_getProtocol(\"${data.name}\");\n" +
    "\n" +
    "if (!$the_inherited_protocol)\n" +
    "→throw new ReferenceError(\"Cannot find protocol declaration for '${data.name}'\");\n" +
    "\n" +
    "protocol_addProtocol($the_protocol, $the_inherited_protocol);\n"
);

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

MethodDef.declarationTemplate = makeTemplate(
    "\n" +
    "// ${data.type}${data.selector}\n" +
    "new objj_method(sel_getUid(\"${data.selector}\"),"
);

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
