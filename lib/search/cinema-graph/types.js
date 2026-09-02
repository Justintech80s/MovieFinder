export const CINEMA_NODE_TYPES=new Set(['movie','person','genre','theme','era','movement','country','style','source']);
export const CINEMA_EDGE_TYPES=new Set(['STARS','DIRECTED_BY','WRITTEN_BY','HAS_GENRE','HAS_THEME','FROM_ERA','FROM_COUNTRY','HAS_STYLE','PART_OF_MOVEMENT','SIMILAR_TO','INFLUENCED_BY','BASED_ON']);
export const clamp01=n=>Math.max(0,Math.min(1,Number.isFinite(Number(n))?Number(n):0));
export function normalizeNode(node={}){if(!node.id||!CINEMA_NODE_TYPES.has(node.type))throw new TypeError('Invalid cinema graph node');return {...node,id:String(node.id).trim().toLowerCase(),label:String(node.label||node.id),metadata:{...(node.metadata||{})}};}
export function normalizeEdge(edge={}){if(!CINEMA_EDGE_TYPES.has(edge.type))throw new TypeError('Invalid cinema graph edge');return {...edge,weight:edge.weight==null?1:clamp01(edge.weight),confidence:edge.confidence==null?1:clamp01(edge.confidence),provenance:edge.provenance||null,metadata:{...(edge.metadata||{})}};}
