import { expect, use } from "chai";
import { solidity } from "ethereum-waffle";
import { jestSnapshotPlugin } from "mocha-chai-jest-snapshot";

use(solidity);
use(jestSnapshotPlugin());

BigInt.prototype.toJSON = function () {
    return this.toString();
};
export { expect };
