// An empty Proxmox nodes option means every cluster node, not no nodes.
export function storageNodes(config={}){
 const value=config.nodes;
 return [...new Set((Array.isArray(value)?value:typeof value==='string'?value.split(','):[]).map(node=>String(node).trim()).filter(Boolean))];
}
export function storageAppliesToNode(config,node){const nodes=storageNodes(config);return !nodes.length||nodes.includes(node);}
export function storagePlacement(config,node){
 const assignedNodes=storageNodes(config),applicable=storageAppliesToNode(config,node);
 return {applicable,assignedNodes,scope:assignedNodes.length?'selected-nodes':'all-nodes',availabilityReason:applicable?null:`Assigned to ${assignedNodes.join(', ')}; not assigned to ${node}.`};
}
