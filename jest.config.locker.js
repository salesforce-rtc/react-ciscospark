const fs = require('fs');

const jestConfigSrc = fs.readFileSync(`${__dirname}/jest.config.json`, 'UTF-8');
const jestConfig = JSON.parse(jestConfigSrc);

module.exports = Object.assign(jestConfig, {
  testEnvironment: 'jest-environment-locker'
});
