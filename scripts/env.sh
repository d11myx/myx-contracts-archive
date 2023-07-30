hh run scripts/deployTokens.js --network $1
hh run scripts/deployPrice.js --network $1
hh run scripts/deployPair.js --network $1
hh run scripts/deployTrading.js --network $1
hh run scripts/mining.js --network $1
hh run scripts/token/mint.js --network $1
hh run scripts/pair/addPair.js --network $1
hh run scripts/pair/updatePair.js --network $1
hh run scripts/price/updateConfig.js --network $1
#hh run scripts/price/setPrices.js --network $1
#hh run scripts/pair/addLiquidity.js --network $1
#sh scripts/trading.sh $1
