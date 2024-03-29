import assert from 'assert';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { Entity, Table } from 'dynamodb-toolbox';
import { UserEntity } from './entities';

import {
  getTableName,
  connect,
  stopLocalDynamoDB,
  startLocalDynamoDB,
  connectTable,
} from './table';

// needs to be long to download Docker image etc.
jest.setTimeout(120000);

describe('DynamoDB Table', () => {
  beforeAll(async () => {
    await startLocalDynamoDB();
  });
  it('Should connect to local table', async () => {
    const tableName = await getTableName();
    assert(tableName);
    const dynamoDB = await connect();
    assert(dynamoDB);
    const tableInfo = await dynamoDB.send(
      new DescribeTableCommand({
        TableName: tableName,
      })
    );

    assert(tableInfo.Table?.TableStatus === 'ACTIVE');
    const dynamoDB2 = await connect();
    assert(dynamoDB2);
  });

  it('Should be able to instantiate Toolbox table', async () => {
    const dynamoDB = await connect();
    const table1 = await connectTable({ client: dynamoDB });
    assert(table1);
    const table2 = await connectTable({
      documentClient: DynamoDBDocument.from(dynamoDB),
    });
    assert(table2);
    const table3 = await connectTable();
    assert(table3);
  });

  it('Should be able to write and read an entity with native toolbox methods', async () => {
    const table = new Table({
      name: await getTableName(),
      partitionKey: 'pk',
      sortKey: 'sk',
      DocumentClient: DynamoDBDocument.from(await connect()),
    });

    const e = new Entity({
      name: 'User',
      attributes: {
        pk: { partitionKey: true },
        sk: { hidden: true, sortKey: true },
        name: { type: 'string', required: true },
        emailVerified: { type: 'boolean', required: true },
      },
      table,
    } as const);

    await e.put({
      pk: 'joe@email.com',
      sk: 'admin',
      name: 'Joe',
      emailVerified: true,
    });

    const { Item: user } = await e.get(
      { pk: 'joe@email.com', sk: 'admin' },
      { attributes: ['name', 'pk'] }
    );

    if (!user) {
      throw new Error('Result not found');
    }
    expect(user.name).toEqual('Joe');
  });

  it('Should be able to write and read an entity with entities', async () => {
    const table = await connectTable();
    // important to do deep copy here because of
    //   https://github.com/jeremydaly/dynamodb-toolbox/issues/310
    const Users = UserEntity(table);
    await Users.put({
      email: 'joe@email.com',
      name: 'Joe',
      emailVerified: true,
    });
    const { Item: user } = await Users.get(
      { email: 'joe@email.com' },
      { attributes: ['name', 'email'] }
    );
    if (!user) {
      throw new Error('Result not found');
    }
    expect(user.name).toEqual('Joe');
    expect(user.email).toEqual('joe@email.com');
  });

  it('Should be able to instantiate entity with deepCopy', async () => {
    const table = await connectTable();
    const Users1 = UserEntity(table);
    await Users1.put({
      email: 'joe@email.com',
      name: 'Joe',
      type: 'user',
      emailVerified: true,
    });

    const Users2 = UserEntity(table);
    // Using Users2 will result in an error here, see https://github.com/jeremydaly/dynamodb-toolbox/issues/366#issuecomment-1366311354
    const { Item: user } = await Users2.get(
      {
        email: 'joe@email.com',
      },
      { attributes: ['email', 'name'] }
    );
    if (!user) {
      throw new Error('Result not found');
    }
    expect(user.name).toEqual('Joe');
    expect(user.email).toEqual('joe@email.com');
  });

  afterAll(async () => {
    await stopLocalDynamoDB();
  });
});
