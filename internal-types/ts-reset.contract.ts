/// <reference path="./ts-reset.d.ts" />

const parsedJson: unknown = JSON.parse("{}");
const fetchedJson: Promise<unknown> = new Response("{}").json();

void parsedJson;
void fetchedJson;
