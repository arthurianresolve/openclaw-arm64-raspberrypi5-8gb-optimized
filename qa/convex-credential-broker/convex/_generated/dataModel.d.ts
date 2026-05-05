export type Id<TableName extends string> = string & {
  readonly __tableName?: TableName;
};
