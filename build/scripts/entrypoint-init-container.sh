#!/bin/sh
#
# Copyright (c) 2021 Red Hat, Inc.
# This program and the accompanying materials are made
# available under the terms of the Eclipse Public License 2.0
# which is available at https://www.eclipse.org/legal/epl-2.0/
#
# SPDX-License-Identifier: EPL-2.0
#
# Contributors:
#   Red Hat, Inc. - initial API and implementation
#

set -e

# Copy checode stuff to the shared volume, unless the volume already holds this version
version=$(cat /checode.version)
# CHECODE_EXTERNAL_NODE=true leaves Node.js and its libraries out of the copy: the dev container
# provides Node.js, see entrypoint-volume.sh. The key changes with the option, so does the copy.
if [ "$CHECODE_EXTERNAL_NODE" = "true" ]; then
  version="$version-external-node"
fi
if [ "$(cat /checode/.checode.version 2>/dev/null)" != "$version" ]; then
  echo "[INFO] Copying checode $version to the volume"
  # The marker goes first and comes back last: an interrupted copy is redone on the next start
  rm -f /checode/.checode.version
  rm -rf /checode/checode-*
  if [ "$CHECODE_EXTERNAL_NODE" = "true" ]; then
    echo "[INFO] CHECODE_EXTERNAL_NODE is set: Node.js is not copied, the dev container must provide it"
    for assembly in checode-linux-musl checode-linux-libc/ubi8 checode-linux-libc/ubi9; do
      mkdir -p "/checode/$assembly"
      for entry in "/$assembly"/* "/$assembly"/.[!.]*; do
        case "${entry##*/}" in
          node | ld_libs) continue ;;
        esac
        if [ -e "$entry" ]; then
          cp -r "$entry" "/checode/$assembly/"
        fi
      done
    done
  else
    cp -r /checode-* /checode/
  fi
  printf '%s' "$version" > /checode/.checode.version
else
  echo "[INFO] checode $version already on the volume"
fi

# Copy entrypoint
cp /entrypoint-volume.sh /checode/
# Node.js version the assemblies are built for, checked when the dev container provides Node.js
cp /checode.node-version /checode/.checode.node-version
# Copy remote configuration
mkdir -p /checode/remote/data/Machine
cp /remote/data/Machine/settings.json /checode/remote/data/Machine/

echo "listing all files copied"
ls -la /checode
