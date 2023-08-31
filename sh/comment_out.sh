#!/bin/bash
var1="console.log"
var2="\/\/ console.log"
for file in $(find "contracts" -type f -name "*.sol")
do
  echo "${file}"
  sed -i '' "s/$var1/$var2/g"  "$file"
done
