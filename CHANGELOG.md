# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 2.0.0 - 2024-01-08

There are no interface changes in this release, but the minimum required Node.js version is now 18.

### Changes 

- BREAKING: Require Node.js 18 or higher.
- Fix issue where includeCrossReferences would incorrectly behave as if it was set to false in the presence of unions.
- Upgrade dependencies: `commander`, `graphql` to latest
- Remove dependency `del`, instead `rimraf` is now used.