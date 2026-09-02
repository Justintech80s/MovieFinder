function escapeHtml(value=''){
  return String(value).replace(/[&<>"']/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
}

function parseDateKey(key){
  const [year,month,day]=String(key||'').split('-').map(Number);
  return new Date(Date.UTC(year,month-1,day));
}

function formatRange(window={}){
  const start=parseDateKey(window.startKey);
  const endExclusive=parseDateKey(window.endKey);
  const end=new Date(endExclusive.getTime()-86400000);
  const format=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
  return `${format.format(start)}–${format.format(end)}`;
}

function number(value){
  return new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(Number(value)||0);
}

function pct(value){
  return `${number(value)}%`;
}

function growth(value){
  if(value==null) return 'n/a';
  const numeric=Number(value)||0;
  return `${numeric>0?'+':''}${number(numeric)}%`;
}

function topText(rows=[]){
  return rows.length?rows.map(row=>`${row.name} (${number(row.count)})`).join(', '):'None recorded';
}

function topHtml(rows=[]){
  if(!rows.length) return '<em>None recorded</em>';
  return rows.map(row=>`${escapeHtml(row.name)} <strong>${escapeHtml(number(row.count))}</strong>`).join('<br>');
}

function section(title,rows){
  return `<h2 style="margin:24px 0 8px;font-size:18px">${escapeHtml(title)}</h2><table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">${rows.map(([label,value])=>`<tr><td style="padding:6px 12px 6px 0;color:#5c6470;vertical-align:top">${escapeHtml(label)}</td><td style="padding:6px 0;font-weight:600;vertical-align:top">${value}</td></tr>`).join('')}</table>`;
}

export function renderWeeklyEmail(summary={}){
  const range=formatRange(summary.window||{});
  const subject=`MovieFinder Weekly Report — ${range}`;
  const observations=summary.observations||[];
  const problem=summary.topProblemQueries?.[0];

  const text=[
    subject,
    '',
    'Growth',
    `Active anonymous visitors: ${number(summary.activeVisitors)} (${growth(summary.weekOverWeek?.activeVisitorsPct)} week over week)`,
    `Sessions: ${number(summary.sessions)} (${growth(summary.weekOverWeek?.sessionsPct)} week over week)`,
    `Searches: ${number(summary.searches)} (${growth(summary.weekOverWeek?.searchesPct)} week over week)`,
    `Returning visitor rate: ${pct(summary.returningVisitorRate)}`,
    `Searches per visitor: ${number(summary.searchesPerVisitor)}`,
    '',
    'What people wanted',
    `Top searches: ${topText(summary.topQueries)}`,
    `Top people: ${topText(summary.topPeople)}`,
    `Top genres: ${topText(summary.topGenres)}`,
    `Top requested streaming services: ${topText(summary.topRequestedProviders)}`,
    '',
    'Commercial activity',
    `Outbound provider clicks: ${number(summary.providerClicks)} (${growth(summary.weekOverWeek?.providerClicksPct)} week over week)`,
    `Top clicked providers: ${topText(summary.topClickedProviders)}`,
    `Top clicked titles: ${topText(summary.topClickedTitles)}`,
    `FREE: ${number(summary.accessTypeClicks?.FREE)} | ADS: ${number(summary.accessTypeClicks?.ADS)} | SUBSCRIPTION: ${number(summary.accessTypeClicks?.FLATRATE)} | RENT: ${number(summary.accessTypeClicks?.RENT)} | BUY: ${number(summary.accessTypeClicks?.BUY)}`,
    `Rent/buy clicks under $5: ${number(summary.priceBands?.under5)}`,
    '',
    'Conversion',
    `Search-session → provider-click rate: ${pct(summary.searchToProviderClickRate)}`,
    '',
    'Search problems',
    `No-result searches: ${number(summary.noResults)} (${pct(summary.noResultRate)})`,
    `Failed searches: ${number(summary.failures)} (${pct(summary.failureRate)})`,
    `Top problem query: ${problem?`${problem.name} — ${problem.noResults} no-result of ${problem.total}`:'None recorded'}`,
    '',
    'Opportunities',
    ...(observations.length?observations.map(item=>`- ${item}`):['- No statistically meaningful observation generated this week.']),
    '',
    'Data note',
    'Active visitors and sessions use anonymous first-party identifiers. Provider clicks represent outbound intent toward viewing, rental, or purchase options; MovieFinder does not infer completed transactions from these clicks.'
  ].join('\n');

  const html=`<!doctype html><html><body style="font-family:Arial,sans-serif;color:#17191d;line-height:1.45;max-width:760px;margin:0 auto;padding:24px">
    <h1 style="font-size:24px;margin:0 0 4px">MovieFinder Weekly Report</h1>
    <div style="color:#6b7280;margin-bottom:20px">${escapeHtml(range)}</div>
    ${section('Growth',[
      ['Active anonymous visitors',`${escapeHtml(number(summary.activeVisitors))} <span style="color:#6b7280">(${escapeHtml(growth(summary.weekOverWeek?.activeVisitorsPct))} WoW)</span>`],
      ['Sessions',`${escapeHtml(number(summary.sessions))} <span style="color:#6b7280">(${escapeHtml(growth(summary.weekOverWeek?.sessionsPct))} WoW)</span>`],
      ['Searches',`${escapeHtml(number(summary.searches))} <span style="color:#6b7280">(${escapeHtml(growth(summary.weekOverWeek?.searchesPct))} WoW)</span>`],
      ['Returning visitor rate',escapeHtml(pct(summary.returningVisitorRate))],
      ['Searches per visitor',escapeHtml(number(summary.searchesPerVisitor))]
    ])}
    ${section('What people wanted',[
      ['Top searches',topHtml(summary.topQueries)],
      ['Top people',topHtml(summary.topPeople)],
      ['Top genres',topHtml(summary.topGenres)],
      ['Top requested streaming services',topHtml(summary.topRequestedProviders)]
    ])}
    ${section('Commercial activity',[
      ['Outbound provider clicks',`${escapeHtml(number(summary.providerClicks))} <span style="color:#6b7280">(${escapeHtml(growth(summary.weekOverWeek?.providerClicksPct))} WoW)</span>`],
      ['Top clicked providers',topHtml(summary.topClickedProviders)],
      ['Top clicked titles',topHtml(summary.topClickedTitles)],
      ['Access types',`FREE ${escapeHtml(number(summary.accessTypeClicks?.FREE))} · ADS ${escapeHtml(number(summary.accessTypeClicks?.ADS))} · SUBSCRIPTION ${escapeHtml(number(summary.accessTypeClicks?.FLATRATE))} · RENT ${escapeHtml(number(summary.accessTypeClicks?.RENT))} · BUY ${escapeHtml(number(summary.accessTypeClicks?.BUY))}`],
      ['Rent/buy clicks under $5',escapeHtml(number(summary.priceBands?.under5))]
    ])}
    ${section('Conversion',[
      ['Search-session → provider-click rate',escapeHtml(pct(summary.searchToProviderClickRate))]
    ])}
    ${section('Search problems',[
      ['No-result searches',`${escapeHtml(number(summary.noResults))} (${escapeHtml(pct(summary.noResultRate))})`],
      ['Failed searches',`${escapeHtml(number(summary.failures))} (${escapeHtml(pct(summary.failureRate))})`],
      ['Top problem query',problem?`${escapeHtml(problem.name)} — ${escapeHtml(problem.noResults)} no-result of ${escapeHtml(problem.total)}`:'None recorded']
    ])}
    <h2 style="margin:24px 0 8px;font-size:18px">Opportunities</h2>
    <ul>${(observations.length?observations:['No statistically meaningful observation generated this week.']).map(item=>`<li>${escapeHtml(item)}</li>`).join('')}</ul>
    <div style="margin-top:28px;padding:14px;background:#f4f5f7;border-radius:8px;color:#5c6470;font-size:12px"><strong>Data note:</strong> Active visitors and sessions use anonymous first-party identifiers. Provider clicks represent outbound intent toward viewing, rental, or purchase options; MovieFinder does not infer completed transactions from these clicks.</div>
  </body></html>`;

  return {subject,html,text};
}

export async function sendWeeklyEmail({message,fetchImpl=globalThis.fetch,env=process.env}={}){
  const apiKey=env?.RESEND_API_KEY;
  const to=env?.ANALYTICS_REPORT_TO;
  const from=env?.ANALYTICS_REPORT_FROM;
  if(!apiKey||!to||!from||!fetchImpl) throw new Error('email configuration is incomplete');
  if(!message?.subject||!message?.html||!message?.text) throw new Error('email message is incomplete');

  const response=await fetchImpl('https://api.resend.com/emails',{
    method:'POST',
    headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json'},
    body:JSON.stringify({from,to,subject:message.subject,html:message.html,text:message.text})
  });
  if(!response.ok) throw new Error(`email delivery ${response.status}`);
  return response.json();
}
