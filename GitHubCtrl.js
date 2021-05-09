const rp = require('request-promise');

class GitHubCtrl {
  constructor (userId, token, repoName) {
    this.userId = userId;
    this.token = token;
    this.repoName = repoName;
    this.baseUrl = 'https://api.github.com/repos';
  }
  getPullRequest (no) {
    const url = `${this.baseUrl}/${this.repoName}/pulls/${no}`;
    return this.getApi(url);
  }
  getApi (url) {
    return rp(
      {
        method: 'GET',
        uri: url,
        json: true,
        headers: {
          Authorization: `token ${this.token}`,
          'user-agent': 'node.js'
        }
      }
    );
  }
  get (url) {
    return rp(
      {
        method: 'GET',
        uri: url,
        auth: {
          user: this.user,
          pass: this.token          
        }
      }
    );
  }
}
module.exports = GitHubCtrl;
