module.exports = {
  branches: [
    'master',
    'next',
    'next-major',
    {
      name: 'beta',
      prerelease: true
    },
    {
      name: 'alpha',
      prerelease: true
    }
  ],
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    ['@semantic-release/changelog', { changelogFile: 'CHANGELOG.md', changelogTitle: '# Changelog' }],
    '@semantic-release/npm',
    [
      '@semantic-release/git',
      {
        assets: ['package.json', 'CHANGELOG.md'],
        message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}'
      }
    ],
    [
      '@semantic-release/github',
      {
        assets: [
          { path: 'release-assets/node-gdrive-linux-x64', label: 'node-gdrive (Linux x64)' },
          { path: 'release-assets/node-gdrive-macos-arm64', label: 'node-gdrive (macOS arm64)' },
          { path: 'release-assets/node-gdrive-win-x64.exe', label: 'node-gdrive (Windows x64)' }
        ]
      }
    ]
  ]
};
