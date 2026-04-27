import { installTestEnv } from "./test-env.js";

export default async () => {
  const { cleanup } = installTestEnv();
  return () => cleanup();
};
