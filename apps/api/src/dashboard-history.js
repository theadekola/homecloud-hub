// Overview charts need node CPU/memory, not every historical container and storage inventory.
// Keep the full history in persistence and the monitoring report for Docker history and exports.
export function dashboardHistory(metrics=[]){
 return metrics.map(({time,cpu,memory,nodes})=>({time,cpu,memory,...(Array.isArray(nodes)?{nodes:nodes.map(({name,cpu,memory})=>({name,cpu,memory}))}:{})}));
}
