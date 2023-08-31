#!/bin/bash
var1="console.log"
var2="\/\/ console.log"
for file in $(find "contracts" -type f -name "*.sol")
do
  echo "${file}"
  sed -i '' "s/$var2/$var1/g"  "$file"
done
