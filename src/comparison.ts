import {CompareWrapperOperator, Operation, OperationType} from "./operation";
import {DynamoEntry, DynamoIndexes, DynamoMapDefinition, SimpleDynamoType} from "./type-mapping";
import {DynamoFilter} from "./filter";
import {AttributeBuilder} from "./naming";
import {DynamoDefinition} from "./dynamo-client-config";

export type KeyComparisonBuilder<T> = {
    eq(value: T): void;
    lt(value: T): void;
    lte(value: T): void;
    gt(value: T): void;
    gte(value: T): void;
    between(a: T, b: T): void;
// eslint-disable-next-line @typescript-eslint/ban-types
} & (T extends string ? { beginsWith(value: string): void } : { });

export type ComparisonBuilder<T> = { [K in keyof T]: Operation<T, T[K]> } & {
    exists(key: keyof T): CompareWrapperOperator<T>;
    existsPath(path: string): CompareWrapperOperator<T>;
    notExists(key: keyof T): CompareWrapperOperator<T>;
    notExistsPath(path: string): CompareWrapperOperator<T>;
    isType(key: keyof T, type: SimpleDynamoType): CompareWrapperOperator<T>;
    isTypePath(path: string, type: SimpleDynamoType): CompareWrapperOperator<T>;
    beginsWith(key: keyof T, beginsWith: string): CompareWrapperOperator<T>;
    beginsWithPath(path: string, beginsWith: string): CompareWrapperOperator<T>;
    contains(key: keyof T, operand: string): CompareWrapperOperator<T>;
    containsPath(path: string, operand: string): CompareWrapperOperator<T>;
    not(comparison: CompareWrapperOperator<T>): CompareWrapperOperator<T>;
};

export class Wrapper {
    constructor(
        public attributeBuilder: AttributeBuilder,
        public expression: string = '',
    ) {}

    add(
        expression = '',
    ): Wrapper {
        this.expression = expression;
        return this;
    }

    and(comparison: Wrapper): Wrapper {
        this.attributeBuilder = this.attributeBuilder.combine(comparison.attributeBuilder);
        this.add(
            `(${this.expression}) AND (${comparison.expression})`,
        );
        return this;
    }

    or(comparison: Wrapper): Wrapper {
        this.attributeBuilder = this.attributeBuilder.combine(comparison.attributeBuilder);
        this.add(
            `(${this.expression}) OR (${comparison.expression})`,
        );
        return this;
    }

}

export class ComparisonBuilderType<
    D extends DynamoMapDefinition,
    T extends DynamoEntry<D>,
    > {
    constructor(definition: D, public wrapper: Wrapper) {
        Object.keys(definition).forEach((key) => {
            (this as any)[key] = new OperationType(this.wrapper, key).operation();
        });
    }

    existsPath(path: string): Wrapper {
        const {expression, builder} = this.wrapper.attributeBuilder.buildPath(path);
        this.wrapper.attributeBuilder = builder;
        return this.wrapper.add(`attribute_exists(${expression})`);
    }
    exists(key: keyof T): Wrapper {
        this.wrapper.attributeBuilder = this.wrapper.attributeBuilder.addNames(key as string);
        return this.wrapper.add(`attribute_exists(${this.wrapper.attributeBuilder.nameFor(key as string)})`);
    }
    notExistsPath(path: string): Wrapper {
        const {expression, builder} = this.wrapper.attributeBuilder.buildPath(path);
        this.wrapper.attributeBuilder = builder;
        return this.wrapper.add(`attribute_not_exists(${expression})`);
    }
    notExists(key: keyof T): Wrapper {
        this.wrapper.attributeBuilder = this.wrapper.attributeBuilder.addNames(key as string);
        return this.wrapper.add(`attribute_not_exists(${this.wrapper.attributeBuilder.nameFor(key as string)})`);
    }

    private typeFor(type: SimpleDynamoType): string {
        const withoutOptional = type.endsWith('?') ? type.substring(0, type.length - 2) : type;
        switch (withoutOptional) {
            case 'string':
                return 'S';
            case 'string set':
                return 'SS';
            case 'number':
                return 'N';
            case 'number set':
                return 'NS';
            case 'binary':
                return 'B';
            case 'binary set':
                return 'BS';
            case 'boolean':
                return 'BOOL';
            case 'null':
                return 'NULL';
            case 'list':
                return 'L';
            default:
                return 'M';
        }
    }

    private getValueName(value: unknown): string {
        const [name, builder] = this.wrapper.attributeBuilder.addValue(value)
        this.wrapper.attributeBuilder = builder;
        return name;
    }

    isType(key: keyof T, type: SimpleDynamoType): Wrapper {
        this.wrapper.attributeBuilder = this.wrapper.attributeBuilder.addNames(key as string);
        return this.wrapper.add(`attribute_type(${this.wrapper.attributeBuilder.nameFor(key as string)}, ${this.getValueName(this.typeFor(type))})`,);
    }
    isTypePath(path: string, type: SimpleDynamoType): Wrapper {
        const {expression, builder} = this.wrapper.attributeBuilder.buildPath(path);
        this.wrapper.attributeBuilder = builder;
        return this.wrapper.add(`attribute_type(${expression}, ${this.getValueName(this.typeFor(type))})`,);
    }

    beginsWith(key: keyof T, beginsWith: string): Wrapper {
        this.wrapper.attributeBuilder = this.wrapper.attributeBuilder.addNames(key as string);
        return this.wrapper.add(`begins_with(${this.wrapper.attributeBuilder.nameFor(key as string)}, ${this.getValueName(beginsWith)})`);
    }

    beginsWithPath(path: string, beginsWith: string): Wrapper {
        const {expression, builder} = this.wrapper.attributeBuilder.buildPath(path);
        this.wrapper.attributeBuilder = builder;
        return this.wrapper.add(`begins_with(${expression}, ${this.getValueName(beginsWith)})`);
    }

    contains(key: keyof T, operand: string): Wrapper {
        this.wrapper.attributeBuilder = this.wrapper.attributeBuilder.addNames(key as string);
        return this.wrapper.add(`contains(${this.wrapper.attributeBuilder.nameFor(key as string)}, ${this.getValueName(operand)})`);
    }

    containsPath(path: string, operand: string): Wrapper {
        const {expression, builder} = this.wrapper.attributeBuilder.buildPath(path);
        this.wrapper.attributeBuilder = builder;
        return this.wrapper.add(`contains(${expression}, ${this.getValueName(operand)})`);
    }

    not(comparison: Wrapper): Wrapper {
        this.wrapper.expression = `NOT (${comparison.expression})`;
        return this.wrapper;
    }

    builder(): ComparisonBuilder<T> {
        return this as unknown as ComparisonBuilder<T>;
    }
}

export interface FilterInfo {
    expression: string;
    attributeBuilder: AttributeBuilder;
}
export function filterParts<
    DEFINITION extends DynamoMapDefinition,
    HASH extends keyof DynamoEntry<DEFINITION>,
    RANGE extends keyof DynamoEntry<DEFINITION> | null,
    INDEXES extends DynamoIndexes<DEFINITION> = null
>(
    definition: DynamoDefinition<DEFINITION, HASH, RANGE, INDEXES>,
    attributeBuilder: AttributeBuilder,
    filter: DynamoFilter<DEFINITION, HASH, RANGE>
): FilterInfo {
    const updatedDefinition = Object.keys(definition.definition)
        .filter((it) => it !== definition.hash && it !== definition.range)
        .reduce((acc, it) => ({ ...acc, [it]: definition.definition[it] }), {});
    const parent = filter(() => new ComparisonBuilderType(updatedDefinition, new Wrapper(attributeBuilder)).builder() as any) as unknown as Wrapper;
    return {
        attributeBuilder: parent.attributeBuilder,
        expression: parent.expression
    };
}

export function conditionalParts<
    DEFINITION extends DynamoMapDefinition,
    HASH extends keyof DynamoEntry<DEFINITION>,
    RANGE extends keyof DynamoEntry<DEFINITION> | null,
    INDEXES extends DynamoIndexes<DEFINITION> = null
    >(
    definition: DynamoDefinition<DEFINITION, HASH, RANGE, INDEXES>,
    attributeBuilder: AttributeBuilder,
    condition: (compare: () => ComparisonBuilder<DEFINITION>) => CompareWrapperOperator<DEFINITION>
): FilterInfo {
    const updatedDefinition = Object.keys(definition.definition)
        .reduce((acc, it) => ({ ...acc, [it]: definition.definition[it] }), {});
    const parent = condition(() => new ComparisonBuilderType(updatedDefinition, new Wrapper(attributeBuilder)).builder() as any) as unknown as Wrapper;
    return {
        attributeBuilder: parent.attributeBuilder,
        expression: parent.expression
    };
}