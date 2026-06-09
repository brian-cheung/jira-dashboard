// Cloudflare Worker — minimal JIRA API proxy
// Deploys to https://jira-proxy.YOURNAME.workers.dev
// Use as Backend Proxy URL on the GitHub Pages config screen

export default {
  async fetch(request) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        }
      });
    }

    try {
      const url = new URL(request.url);
      const jiraPath = url.pathname.replace('/api/proxy/', '');

      const jiraUrl = request.headers.get('x-jira-url');
      const jiraEmail = request.headers.get('x-jira-email');
      const jiraToken = request.headers.get('x-jira-token');

      if (!jiraUrl || !jiraEmail || !jiraToken) {
        return new Response(JSON.stringify({ error: 'Missing x-jira-url, x-jira-email, or x-jira-token headers' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      const auth = btoa(`${jiraEmail}:${jiraToken}`);
      const targetUrl = `${jiraUrl}/rest/api/3/${jiraPath}`;

      const headers = {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
        'X-Atlassian-Token': 'no-check',
      };

      let body = null;
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        headers['Content-Type'] = 'application/json';
        body = await request.text();
      }

      const jiraRes = await fetch(targetUrl, { method: request.method, headers, body });
      const responseBody = await jiraRes.text();

      return new Response(responseBody, {
        status: jiraRes.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
  }
};
