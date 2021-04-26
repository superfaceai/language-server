# Superface Language server

This is a language server according to the [LSP protocol](https://microsoft.github.io/language-server-protocol/).

## Install

Install the package by calling:

```
yarn add @superfaceai/language-server
```

## Publishing a new version

Package publishing is done through GitHub release functionality.

[Draft a new release](https://github.com/superfaceai/language-server/releases/new) to publish a new version of the package.

Use semver for the version tag. It must be in format of `v<major>.<minor>.<patch>`.

Github Actions workflow will pick up the release and publish it as one of the [packages](https://www.npmjs.com/package/@superfaceai/language-server).

## Licensing

Licenses of `node_modules` are checked during push CI/CD for every commit. Only the following licenses are allowed:

- 0BDS
- MIT
- Apache-2.0
- ISC
- BSD-3-Clause
- BSD-2-Clause
- CC-BY-4.0
- CC-BY-3.0;BSD
- CC0-1.0
- Unlicense

## License

The Superface Parser is licensed under the [MIT](LICENSE).
© 2021 Superface
