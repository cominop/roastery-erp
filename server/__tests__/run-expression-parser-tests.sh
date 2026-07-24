#!/bin/bash
# Run expression parser Python tests
set -e
cd "$(dirname "$0")/.."
pytest __tests__/test_expression_parser.py -v 2>&1
