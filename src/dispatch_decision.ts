export type WorkOrder = {
  id: string;
  address: string;
  issue: string;
  photoUrls: string[];
  dispatchStatus: "new" | "queued" | "assigned";
  technicianFollowUp: string | null;
};

export function chooseDispatch(workOrder: WorkOrder): WorkOrder {
  if (workOrder.dispatchStatus !== "new" || workOrder.photoUrls.length === 0) {
    return workOrder;
  }
  return { ...workOrder, dispatchStatus: "queued" };
}
