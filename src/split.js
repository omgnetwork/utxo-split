const BN = require('bn.js');
const JSONBigNumber = require('omg-json-bigint');
const { transaction } = require('@omisego/omg-js-util');

function sign(childChain, tx, privateKeys) {
  const typedData = transaction.getTypedData(tx, childChain.plasmaContractAddress);
  const signatures = childChain.signTransaction(typedData, privateKeys);
  return childChain.buildSignedTransaction(typedData, signatures);
}

function splitAmount(amount, numParts) {
  if (numParts === 1) {
    return [amount];
  }

  const a = amount.divn(numParts);
  const ret = new Array(numParts - 1).fill(a);
  ret.push(amount.sub(a.muln(numParts - 1)));
  return ret;
}

function createSplitTxFeeToken(utxo, feeAmount, numOutputs) {
  const tx = {
    inputs: [utxo],
    outputs: [],
  };

  const spendAmount = new BN(utxo.amount).sub(new BN(feeAmount));
  const amounts = splitAmount(spendAmount, numOutputs);
  amounts.forEach((amount) => tx.outputs.push({
    outputType: 1,
    outputGuard: utxo.owner,
    currency: utxo.currency,
    amount,
  }));

  return tx;
}

function createSplitTxNonFeeToken(utxo, feeAmount, feeUtxo, numOutputs) {
  const tx = {
    inputs: [utxo, feeUtxo],
    outputs: [],
  };

  let feeChange = 0;
  const feeUtxoAmount = new BN(feeUtxo.amount);
  feeAmount = new BN(feeAmount);
  if (feeUtxoAmount.gt(feeAmount)) {
    feeChange = feeUtxoAmount.sub(feeAmount);
    tx.outputs.push({
      outputType: 1,
      outputGuard: feeUtxo.owner,
      currency: feeUtxo.currency,
      amount: feeChange,
    });
  }

  const numSpendOutputs = feeChange === 0 ? numOutputs : numOutputs - 1;
  const amounts = splitAmount(new BN(utxo.amount), numSpendOutputs);
  amounts.forEach((amount) => tx.outputs.push({
    outputType: 1,
    outputGuard: utxo.owner,
    currency: utxo.currency,
    amount,
  }));

  return tx;
}

async function submit(childChain, tx, privateKey) {
  const privateKeys = new Array(tx.inputs.length).fill(privateKey);
  const signedTx = sign(childChain, tx, privateKeys);
  const { blknum, txindex } = await childChain.submitTransaction(signedTx);
  const nextUtxos = tx.outputs.map((output, i) => ({
    amount: output.amount,
    currency: output.currency,
    owner: output.outputGuard,
    blknum,
    txindex,
    oindex: i,
  }));

  return nextUtxos;
}

async function split(allUtxos, childChain, account, token, minValue, feeToken, feeAmount) {
  const isFeeToken = token.toLowerCase() === feeToken.toLowerCase();

  // Only split utxos that are least twice the minValue
  const minUtxoValue = new BN(minValue).muln(2);
  let utxos = allUtxos
    .filter((utxo) => utxo.currency.toLowerCase() === token.toLowerCase())
    .filter((utxo) => new BN(utxo.amount).gte(minUtxoValue));

  if (utxos.length === 0) {
    console.log('No suitable utxos left to split');
    return;
  }

  console.log(`Splitting ${utxos.length} utxos`);

  let txs;

  if (!isFeeToken) {
    const feeUtxos = allUtxos
      .filter((utxo) => utxo.currency.toLowerCase() === feeToken.toLowerCase())
      .filter((utxo) => new BN(utxo.amount).gte(new BN(feeAmount)));

    if (feeUtxos.length < utxos.length) {
      utxos = utxos.slice(0, feeUtxos.length);
    }

    txs = utxos.map((utxo, i) => {
      const x = new BN(utxo.amount).div(new BN(minValue)).toNumber();
      const numOutputs = Math.min(4, x);
      return createSplitTxNonFeeToken(utxo, feeAmount, feeUtxos[i], numOutputs);
    });
  } else {
    txs = utxos.map((utxo) => {
      const x = new BN(utxo.amount).div(new BN(minValue)).toNumber();
      const numOutputs = Math.min(4, x);
      return createSplitTxFeeToken(utxo, feeAmount, numOutputs);
    });
  }

  const results = await Promise.all(txs.map((tx) => submit(childChain, tx, account.privateKey)));
  const nextUtxos = results.flat();

  split(nextUtxos, childChain, account, token, minValue, feeToken, feeAmount);
}

module.exports = { split };
