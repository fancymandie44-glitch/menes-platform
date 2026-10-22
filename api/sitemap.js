'use strict';

const { readSiteStore, resolveSiteId, setLambdaEvent } = require('../lib/platform');
const { sitemapXml, SITE_ORIGIN } = require('../lib/seo');

exports.handler = async (event) => {
  setLambdaEvent(event);
  const headers = {
    'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': 'public, max-age=300, must-revalidate',
  };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'HEAD') {
    return { statusCode: 405, headers, body: '' };
  }
  const host = event.headers?.['x-forwarded-host'] || event.headers?.host || '';
  const siteId = await resolveSiteId(host, event.queryStringParameters?.site);
  const data = await readSiteStore(siteId);
  const xml = sitemapXml(data?.products || [], SITE_ORIGIN);
  return {
    statusCode: 200,
    headers,
    body: event.httpMethod === 'HEAD' ? '' : xml,
  };
};
