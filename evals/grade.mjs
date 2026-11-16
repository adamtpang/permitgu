import { KB } from '../api/_kb.mjs';

const normalizeAmount = (amount) => '$' + Number(amount.slice(1).replace(/,/g, '').replace(/\.$/, ''));

export function grade(question, result) {
  const topicText = KB[question.topic]?.text || '';
  const allowedAmounts = new Set((topicText.match(/\$\d[\d,.]*/g) || []).map(normalizeAmount));
  const amounts = [...result.text.matchAll(/\$\d[\d,.]*/g)];
  const invented = amounts.filter((match) => {
    if (allowedAmounts.has(normalizeAmount(match[0]))) return false;
    const amount = match[0].replace(/[.,]+$/, '');
    const after = result.text.slice(match.index + match[0].length);
    const before = result.text.slice(Math.max(0, match.index - 60), match.index);
    const isQuotedValuation = question.q.includes(amount) && (/^\s+(house|home|valuation|project|construction)\b/i.test(after) || /(?:valuation|house value|home value|project value|value of the work)[^.!?]*$/i.test(before) || (/(?:your|given|stated|quoted)\s*$/i.test(before) && /^\s+(figure|estimate|value|valuation)\b/i.test(after)));
    return !isQuotedValuation;
  }).map((match) => match[0]);
  const citations = [...result.text.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g)].flatMap((match) => match[1].split(/\s*,\s*/).map(Number));
  const sources = result.meta?.sources || [];
  const validCitations = citations.length > 0 && citations.every((number) => number >= 1 && number <= sources.length);
  const officialOrArchive = (source) => {
    try {
      const host = new URL(source.url).hostname;
      const agencyDomains = ['guamtax.com', 'guamcourts.org', 'govguamdocs.com', 'guampowerauthority.com', 'guamwaterworks.org', 'gdoe.net'];
      return host !== 'permitgu.vercel.app' && (host.endsWith('.gov') || agencyDomains.some((domain) => host === domain || host.endsWith('.' + domain)) || host === 'web.archive.org' || host === 'archive.org');
    } catch { return false; }
  };
  const refuses = /(only help with|don't have (a )?(verified|confirmed)|do not have (a )?(verified|confirmed)|not (yet )?confirmed|no confirmed|not specified|check (with )?the official|confirm.{0,60}with|(ask|call|contact|email) (DPW|the agency|DEH|DLM|DPHSS|DPR|GFD|Guam EPA|Rev (and|&) Tax|Public Works|Public Health|Land Management|each site owner))/i.test(result.text);
  const checks = {
    status: result.status === 200,
    complete: result.complete === true && result.errors.length === 0,
    no_invented_dollars: invented.length === 0,
  };
  if (question.kind === 'out_of_scope') checks.refuses = /only help with|don't have verified|do not have verified/i.test(result.text);
  else {
    checks.valid_citations = validCitations;
    checks.external_evidence = validCitations && citations.some((number) => {
      const source = sources[number - 1];
      return officialOrArchive(source) || (['trap_unknown', 'trap_fee'].includes(question.kind) && refuses && topicText.includes(source.url) && !source.url.startsWith('https://permitgu.vercel.app'));
    });
    checks.right_topic = result.meta && (result.meta.topic === question.topic || result.meta.topic === 'multi');
  }
  if (question.kind === 'trap_fee' || question.kind === 'trap_unknown') checks.flags_unconfirmed = refuses;
  if (question.required) checks.required_content = question.required.every((pattern) => new RegExp(pattern, 'i').test(result.text));
  if (question.forbidden) checks.no_forbidden_claims = question.forbidden.every((pattern) => !new RegExp(pattern, 'i').test(result.text));
  if (question.source_matches) checks.supporting_source = validCitations && question.source_matches.every((pattern) => citations.some((number) => new RegExp(pattern, 'i').test(sources[number - 1].url)));
  return { checks, invented };
}
