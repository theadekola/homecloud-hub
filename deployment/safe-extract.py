#!/usr/bin/env python3
"""Extract our controller backup archives without links, devices or path traversal."""
import pathlib, sys, tarfile
archive, target = sys.argv[1:]
root = pathlib.Path(target).resolve()
with tarfile.open(archive) as source:
    for entry in source.getmembers():
        destination = (root / entry.name).resolve()
        if not destination.is_relative_to(root) or not (entry.isfile() or entry.isdir()):
            raise SystemExit('Unsafe backup archive entry; restore stopped.')
    source.extractall(root, filter='data')
