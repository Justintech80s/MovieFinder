import {normalizeNode,normalizeEdge} from './types.js';
export function createCinemaGraph(){
 const nodeMap=new Map(),edgeList=[];
 const api={
  upsertNode(input){const node=normalizeNode(input),prev=nodeMap.get(node.id);nodeMap.set(node.id,prev?{...prev,...node,metadata:{...(prev.metadata||{}),...(node.metadata||{})}}:node);return nodeMap.get(node.id);},
  addEdge(from,to,input){from=String(from).trim().toLowerCase();to=String(to).trim().toLowerCase();if(!nodeMap.has(from)||!nodeMap.has(to))throw new Error('Cinema graph edge requires existing nodes');const edge={from,to,...normalizeEdge(input)};const key=`${from}|${to}|${edge.type}`;const i=edgeList.findIndex(x=>x.key===key);const stored={key,...edge};if(i>=0)edgeList[i]=stored;else edgeList.push(stored);return stored;},
  getNode(id){return nodeMap.get(String(id).trim().toLowerCase())||null;},
  nodes(){return [...nodeMap.values()];},
  edges(){return edgeList.map(({key,...e})=>e);},
  neighbors(id,{edgeTypes}={}){id=String(id).trim().toLowerCase();const allowed=edgeTypes?.length?new Set(edgeTypes):null;return edgeList.filter(e=>e.from===id&&(!allowed||allowed.has(e.type))).map(({key,...edge})=>({edge,node:nodeMap.get(edge.to)}));}
 };
 return api;
}
