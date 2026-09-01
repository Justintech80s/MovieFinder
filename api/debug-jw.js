const JW='https://apis.justwatch.com/graphql';

const QUERIES={
  minimal:`query Probe($country:Country!,$first:Int!,$search:String!){popularTitles(country:$country,first:$first,filter:{searchQuery:$search}){edges{node{id objectType}}}}`,
  content:`query Probe($country:Country!,$language:Language!,$first:Int!,$search:String!){popularTitles(country:$country,first:$first,filter:{searchQuery:$search}){edges{node{id objectType content(country:$country,language:$language){title originalReleaseYear fullPath}}}}}`,
  description:`query Probe($country:Country!,$language:Language!,$first:Int!,$search:String!){popularTitles(country:$country,first:$first,filter:{searchQuery:$search}){edges{node{id content(country:$country,language:$language){title shortDescription}}}}}`,
  scoring:`query Probe($country:Country!,$language:Language!,$first:Int!,$search:String!){popularTitles(country:$country,first:$first,filter:{searchQuery:$search}){edges{node{id content(country:$country,language:$language){title scoring{imdbScore imdbVotes tomatoMeter}}}}}}`,
  poster:`query Probe($country:Country!,$language:Language!,$first:Int!,$search:String!){popularTitles(country:$country,first:$first,filter:{searchQuery:$search}){edges{node{id content(country:$country,language:$language){title posterUrl}}}}}`,
  offersBasic:`query Probe($country:Country!,$first:Int!,$search:String!){popularTitles(country:$country,first:$first,filter:{searchQuery:$search}){edges{node{id offers(country:$country,platform:WEB){monetizationType presentationType standardWebURL package{clearName shortName technicalName}}}}}}`,
  offersRetail:`query Probe($country:Country!,$language:Language!,$first:Int!,$search:String!){popularTitles(country:$country,first:$first,filter:{searchQuery:$search}){edges{node{id offers(country:$country,platform:WEB){monetizationType retailPrice(language:$language) retailPriceValue currency presentationType standardWebURL package{clearName shortName technicalName}}}}}}`
};

export default async function handler(req,res){
  const variant=String(req.query?.variant||'minimal');
  const query=QUERIES[variant];
  if(!query) return res.status(400).json({error:'unknown variant',variants:Object.keys(QUERIES)});
  const search=String(req.query?.search||'Godfather');
  const variables={country:'US',language:'en',first:3,search};
  try{
    const upstream=await fetch(JW,{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({query,variables})});
    const text=await upstream.text();
    return res.status(200).json({variant,upstreamStatus:upstream.status,ok:upstream.ok,body:text.slice(0,4000)});
  }catch(error){
    return res.status(500).json({variant,error:String(error?.message||error)});
  }
}
