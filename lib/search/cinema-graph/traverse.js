export function traverseCinemaGraph(graph,startId,{edgeTypes,maxDepth=2}={}){
 const results=[],seen=new Set([String(startId).toLowerCase()]),queue=[{id:String(startId).toLowerCase(),depth:0,path:[]}];
 while(queue.length){const current=queue.shift();if(current.depth>=maxDepth)continue;for(const item of graph.neighbors(current.id,{edgeTypes})){const path=[...current.path,item.edge];results.push({...item,depth:current.depth+1,path});if(!seen.has(item.node.id)){seen.add(item.node.id);queue.push({id:item.node.id,depth:current.depth+1,path});}}}
 return results;
}
