export {createCinemaGraph} from './cinema-graph/store.js';
export {traverseCinemaGraph} from './cinema-graph/traverse.js';
export {CINEMA_NODE_TYPES,CINEMA_EDGE_TYPES} from './cinema-graph/types.js';

const CONCEPTS={
'giallo':{terms:['giallo','italian','mystery','thriller','horror'],why:'Italian giallo / mystery-horror connection'},
'spaghetti western':{terms:['spaghetti western','western','italian'],why:'Italian spaghetti-western connection'},
'new hollywood':{terms:['new hollywood','1970s','american'],why:'New Hollywood era connection'},
'grimy':{terms:['gritty','crime','urban','revenge'],why:'gritty, street-level tone'},
'gritty':{terms:['gritty','crime','realist'],why:'gritty realist tone'},
'paranoid':{terms:['paranoia','conspiracy','psychological','thriller'],why:'paranoid/conspiracy tone'},
'blaxploitation':{terms:['blaxploitation','crime','action','1970s'],why:'blaxploitation-era connection'},
'grindhouse':{terms:['grindhouse','exploitation','cult'],why:'grindhouse/exploitation connection'}
};
const norm=s=>String(s||'').toLowerCase();
export function extractCinemaConcepts(query=''){const q=norm(query);return Object.keys(CONCEPTS).filter(k=>q.includes(k));}
export function scoreCinemaRelations(movie,intent={}){const hay=norm([movie.title,movie.description,...(movie.genres||[]),...(movie.tags||[])].join(' '));let score=0;const reasons=[];for(const c of intent.concepts||extractCinemaConcepts(intent.raw)){const x=CONCEPTS[c];let hits=0;for(const t of x.terms)if(hay.includes(norm(t)))hits++;if(hits){score+=Math.min(.22,.05*hits);reasons.push(x.why);}}return {score:+Math.min(1,score).toFixed(3),reasons:[...new Set(reasons)]};}
