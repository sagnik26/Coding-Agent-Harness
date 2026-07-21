import { unrelatedBug } from "./util.ts";

if (unrelatedBug() !== 42) {
  console.error("FAIL: unrelatedBug expected 42");
  process.exit(1);
}
console.log("ok");
