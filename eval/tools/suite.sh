#!/bin/bash
# Clean run + noisy-Claude runs over every ground-truth document. Usage: tools/suite.sh TAG [noise] [seeds]
TAG=${1:-suite}; NOISE=${2:-0.3}; SEEDS=${3:-"1 2 3 4 5"}
cd "$(dirname "$0")/.."
node lib/eval.cjs --tag $TAG-clean 2>&1 | grep ALL | sed "s/^/clean   /"
for s in $SEEDS; do node lib/eval.cjs --tag $TAG-n$s --noise $NOISE --seed $s 2>&1 | grep ALL | sed "s/^/seed $s  /"; done
