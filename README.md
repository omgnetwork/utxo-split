# utxo-split

A simple tool to recursively split an account's utxos into smaller value utxos.

# Setup
- Uses the following environment variables:
```
ETH_NODE=                   <entry point to an ethereum node>
WATCHER_URL=                <url of an informational watcher>
PLASMA_CONTRACT_ADDRESS=    <address of the plasma framework contract>
ACCOUNT_PK=                 <private key of the account>
OMG_FEE_TOKEN=              <the fee token to use>
SPLIT_TOKEN=                <the token of the utxos that will be split>
MIN_SPLIT_VALUE=            <the minimum value that a utxo should haveend up with>
```

Note that the `MIN_SPLIT_VALUE` is not an exact figure. For example, if `MIN_SPLIT_VALUE=20` and a utxo has a value of 100, it will be split into 4 utxos of value `25` (ignoring the fee for this example), instead of 5 utxos of valur `20`. 
The reason for this is to reduce the number of transactions sent.
