const CONCEPTS={
'giallo':{terms:['giallo','italian','mystery','thriller','horror'],why:'Italian giallo / mystery-horror connection'},
'spaghetti western':{terms:['spaghetti western','western','italian'],why:'Italian spaghetti-western connection'},
'new hollywood':{terms:['new hollywood','1970s','american'],why:'New Hollywood era connection'},
'grimy':{terms:['gritty','crime','urban','revenge'],why:'gritty, street-level tone'},
'gritty':{terms:['gritty','crime','realist'],why:'gritty realist tone'},
'paranoid':{terms:['paranoia','conspiracy','psychological','thriller'],why:'paranoid/conspiracy tone'},
'blaxploitation':{terms:['blaxploitation','crime','action','1970s'],why:'blaxploitation-era connection'},
'grindhouse':{terms:['grindhouse','exploitation','cult'],why:'grindhouse/exploitation connection'},
'heist':{terms:['heist','robbery','caper','bank robbery','jewel theft','getaway','crew'],why:'heist/robbery connection'},
'car':{terms:['car','cars','automotive','racing','street racing','car chase','getaway driver'],why:'automotive/racing connection'},
'prison escape':{terms:['prison escape','jailbreak','prison','escape'],why:'prison-escape connection'},
'samurai':{terms:['samurai','chanbara','japanese period'],why:'samurai/chanbara connection'},
'mob':{terms:['mob','mafia','organized crime','gangster'],why:'organized-crime connection'},
'martial arts':{terms:['martial arts','kung fu','karate'],why:'martial-arts connection'},
'spy':{terms:['spy','espionage','secret agent'],why:'espionage connection'},
'serial killer':{terms:['serial killer','serial murder','crime','thriller'],why:'serial-killer crime connection'},
'revenge':{terms:['revenge','vengeance','vigilante'],why:'revenge/vigilante connection'},
'film noir':{terms:['film noir','noir','crime','detective'],why:'film-noir connection'},
'road movie':{terms:['road movie','road trip','travel'],why:'road-movie connection'},
'conspiracy':{terms:['conspiracy','paranoia','political thriller'],why:'conspiracy-thriller connection'}
};
const norm=s=>String(s||'').toLowerCase();
export function extractCinemaConcepts(query=''){const q=norm(query);return Object.keys(CONCEPTS).filter(k=>q.includes(k));}
export function scoreCinemaRelations(movie,intent={}){const hay=norm([movie.title,movie.description,...(movie.genres||[]),...(movie.tags||[])].join(' '));let score=0;const reasons=[];for(const c of intent.concepts||extractCinemaConcepts(intent.raw)){const x=CONCEPTS[c];if(!x)continue;let hits=0;for(const t of x.terms)if(hay.includes(norm(t)))hits++;if(hits){score+=Math.min(.22,.05*hits);reasons.push(x.why);}}return {score:+Math.min(1,score).toFixed(3),reasons:[...new Set(reasons)]};}
