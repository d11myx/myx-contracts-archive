hh run scripts/deployTokens.js --network $1
hh run scripts/deployFastPriceFeed.js --network $1
hh run scripts/deployPair.js --network $1
hh run scripts/pair/setPair.js --network $1
hh run scripts/deployTrading.js --network $1
hh run scripts/mining.ts --network $1
hh run scripts/token/mint.js --network $1
hh run scripts/price/setAnswer.js --network $1
hh run scripts/price/setPrices.js --network $1
hh run scripts/price/query.js --network $1
hh run scripts/pair/addLiquidity.js --network $1
sh scripts/trading.sh $1
