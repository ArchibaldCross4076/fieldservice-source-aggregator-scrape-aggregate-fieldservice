import assert from "node:assert/strict";
import { chooseDispatch } from "./dispatch_decision.ts";

const queued = chooseDispatch({
  id: "wo-7",
  address: "Austin",
  issue: "HVAC repair",
  photoUrls: ["https://photos.example/wo-7.jpg"],
  dispatchStatus: "new",
  technicianFollowUp: null
});

assert.equal(queued.dispatchStatus, "queued");
assert.equal(queued.photoUrls.length, 1);
console.log("dispatch decision: photographed new work orders enter the queue");
