import * as fs from "fs";

import {
    quicktype,
    InputData,
    JSONSchemaInput,
    CSharpTargetLanguage,
    cSharpOptions,
    CSharpRenderer,
    RenderContext,
    getOptionValues,
    Sourcelike,
    ClassType,
    ClassProperty,
    Name
} from "quicktype-core";
import { SourcelikeArray } from "quicktype-core/dist/Source";
import { AccessModifier } from "quicktype-core/dist/language/CSharp"

class ReadOnlyStructCSharpTargetLanguage extends CSharpTargetLanguage {
    public constructor() {
        super("C#", ["csharp"], "cs");
    }

    protected makeRenderer(renderContext: RenderContext, untypedOptionValues: { [name: string]: any }): CSharpRenderer {
        return new ReadOnlyStructCSharpRenderer(this, renderContext, getOptionValues(cSharpOptions, untypedOptionValues));
    }
}

class ReadOnlyStructCSharpRenderer extends CSharpRenderer {
    protected emitType(
        description: string[] | undefined,
        accessModifier: AccessModifier,
        declaration: Sourcelike,
        name: Sourcelike,
        baseclass: Sourcelike | undefined,
        emitter: () => void
    ): void {
        switch (accessModifier) {
            case AccessModifier.Public:
                declaration = ["public ", "readonly struct"];
                break;
            case AccessModifier.Internal:
                declaration = ["internal ", "readonly struct"];
                break;
            default:
                break;
        }
        this.emitDescription(description);
        if (baseclass === undefined) {
            this.emitLine(declaration, " ", name);
        } else {
            this.emitLine(declaration, " ", name, " : ", baseclass);
        }
        this.emitClassBlock(name, emitter);
    }

    protected propertyDefinition(p: ClassProperty, name: Name, c: ClassType, jsonName: string): Sourcelike {
        const originalDefinition = super.propertyDefinition(p, name, c, jsonName);
        const getOnlyDefinition = (originalDefinition as SourcelikeArray).slice();
        getOnlyDefinition[4] = " { get; }";
        return getOnlyDefinition;
    }

    private emitClassBlock(name: Sourcelike, f: () => void, semicolon: boolean = false): void {
        this.emitLine("{");
        this.indent(() => this.emitConstructor(name));
        this.indent(f);
        this.emitLine("}", semicolon ? ";" : "");
    }

    private emitConstructor(className: Sourcelike): void {
        const classType = this.getClassTypeByName(className);

        const assignments: SourcelikeArray = [];
        const paramList: SourcelikeArray[] = [];
        this.forEachClassProperty(classType, "none", (propName, jsonName, p) => {
            const propDef = this.propertyDefinition(p, propName, classType, jsonName) as SourcelikeArray;
            paramList.push([propDef[1], " ", jsonName]);
            assignments.push([propName, " = ", jsonName, ";"]);
        });

        const params = ReadOnlyStructCSharpRenderer.intersperse(paramList, ", " as Sourcelike);

        this.emitLine("public ", className, "(", ...params, ")");
        this.emitBlock(() => {
            for (const assignment of assignments) {
                this.emitLine(assignment);
            }
        })
        this.emitLine();
    }

    private getClassTypeByName(className: Sourcelike): ClassType {
        let result;
        this.forEachObject("none", (c: ClassType, otherClassName: Name) => {
            if (className === otherClassName) {
                result = c;
            }
        });

        if (!result) {
            throw new Error("Could not look up class type by name");
        }

        return result;
    }

    private static intersperse<T>(elements: T[], separator: T): T[] {
        const result = [];
        for (let i = 0; i < elements.length; i++) {
            if (i !== 0) {
                result.push(separator);
            }
            result.push(elements[i]);
        }
        return result;
    }
}

async function main(program: string, args: string[]): Promise<void> {
    if (args.length !== 1) {
        console.error(`Usage: ${program} SCHEMA`);
        process.exit(1);
    }

    const inputData = new InputData();
    const source = { name: "Player", schema: fs.readFileSync(args[0], "utf8") };

    // We need to pass the attribute producer to the JSONSchemaInput
    await inputData.addSource("schema", source, () => new JSONSchemaInput(undefined, []));

    const lang = new ReadOnlyStructCSharpTargetLanguage();

    const { lines } = await quicktype({ lang, inputData });

    for (const line of lines) {
        console.log(line);
    }
}

main(process.argv[1], process.argv.slice(2)).catch(e => {
    console.error(e);
    process.exit(1);
});
