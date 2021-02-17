require('dotenv').config();
const { ChildChain } = require('@omisego/omg-js');
const { Account } = require('eth-lib');
const axios = require('axios');
const JSONBigNumber = require('omg-json-bigint');
const { split } = require('./split');

let feeInfoCached = null;

async function getFeeInfo(childChain, currency) {
  if (!feeInfoCached) {
    const fees = (await childChain.getFees())['1'];
    feeInfoCached = fees.find((fee) => fee.currency.toLowerCase() === currency.toLowerCase());
    if (!feeInfoCached) {
      throw new Error(`Configured FEE_TOKEN ${currency} is not a supported fee token`);
    }
  }
  return feeInfoCached;
}

async function getUtxos(childChain, address, utxos = [], page = 1) {
  const options = {
    method: 'POST',
    url: `${childChain.watcherUrl}/account.get_utxos`,
    headers: { 'Content-Type': 'application/json' },
    data: JSONBigNumber.stringify({
      address,
      limit: 200,
      page,
    }),
    transformResponse: [(data) => data],
  };
  const res = await axios.request(options);

  let data;
  try {
    data = JSONBigNumber.parse(res.data);
  } catch (err) {
    throw new Error(`Unable to parse response from server: ${err}`);
  }

  if (data.success) {
    utxos = utxos.concat(data.data);
    if (data.data.length < data.data_paging.limit) {
      return utxos;
    }
    return getUtxos(childChain, address, utxos, data.data_paging.page + 1);
  }

  throw new Error(data.data);
}

const childChain = new ChildChain({
  watcherUrl: process.env.WATCHER_URL,
  plasmaContractAddress: process.env.PLASMAFRAMEWORK_CONTRACT_ADDRESS,
});

async function main() {
  const account = Account.fromPrivate(process.env.ACCOUNT_PK);
  console.log(`Splitting utxos of account: ${account.address}`);
  const feeInfo = await getFeeInfo(childChain, process.env.OMG_FEE_TOKEN);
  const allUtxos = await getUtxos(childChain, account.address);
  await split(
    allUtxos,
    childChain,
    account,
    process.env.SPLIT_TOKEN,
    50,
    process.env.OMG_FEE_TOKEN,
    feeInfo.amount,
  );
}

main();
