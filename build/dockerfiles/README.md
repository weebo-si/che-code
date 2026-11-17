## Running Visual Studio Code - Open Source ("Code - OSS") in a UBI9-based container
`Node.js` is required to run `Code-OSS` (see required version [here](https://github.com/microsoft/vscode/wiki/How-to-Contribute#prerequisites)).
This project includes [dockefiles](https://github.com/che-incubator/che-code/tree/main/build/dockerfiles) that based on the `ubi8/nodejs-18` image - an assembly contains `Node.js 18` that requires `OpenSSL 1`.

One of the differences between `UBI8` and `UBI9` image is:
- `UBI8` image uses `OpenSSL 1`
- `UBI9` image uses `OpenSSL 3`

 So, `Code-OSS` can be run in a `UBI8`-based container without additional requirements.

In order to run `Code-OSS` in a `UBI9`-based container you'll need the following:
- install `Node.js 18` which statically links against `OpenSSL 3`
- provide environment variable `VSCODE_NODEJS_RUNTIME_DIR` with the path to the installed node

For example:
```
FROM registry.access.redhat.com/ubi9/ubi:9.2

RUN dnf install -y nodejs
ENV VSCODE_NODEJS_RUNTIME_DIR="/usr/bin"
```

The `RUN` instruction installs `Node.js 16` which statically links against `OpenSSL 3` as the image is based on the `UBI9` image.
The `ENV` instruction provides the env variable to let `che-code` know where the `Node.js` is placed.

NOTE:
- `UBI9`-based container might contain few versions of `Node.js`
- any version of `Node.js` can be used as default
- the environment variable `VSCODE_NODEJS_RUNTIME_DIR` should be provided to let `che-code` know which `Node.js` should be used for running `Code-OSS`

## Running `Code-OSS` without the bundled `Node.js`

Set `CHECODE_EXTERNAL_NODE=true` on the init container (`che-code-injector` in the editor definition) to leave the bundled `Node.js` and its libraries (`ld_libs`) out of the copy to the `checode` volume. The IDE then runs with the `Node.js` of the dev container only:

- `VSCODE_NODEJS_RUNTIME_DIR` if the dev image sets it, the `node` of the `PATH` otherwise
- it must have the same major version as the `target` of `code/remote/.npmrc`, the native modules are built for it
- the dev container stops with an error in `/checode/entrypoint-logs.txt` when there is no such `Node.js`, there is no fallback

Point `VSCODE_NODEJS_RUNTIME_DIR` to a fixed installation directory, not to the shims of a version manager (mise, asdf, nvm): a shim picks the version from the current directory.
