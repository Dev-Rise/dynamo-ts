import { DynamoTypeFrom } from '../src/types';
import {exampleCarTable} from "./example-table";
import {tableClient} from "./query-filter-expressions";

type Car = DynamoTypeFrom<typeof exampleCarTable>;

export async function getModelS(): Promise<Car | undefined> {
    const result = await tableClient.get({identifier: '1234', make: 'Tesla'})
    return result.item
}

export async function getModelSProjected(): Promise<{ model: string } | undefined> {
    const result = await tableClient.get({identifier: '1234', make: 'Tesla'}, {projection: projector => projector.project('model')})
    return result.item
}


