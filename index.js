const StellarSdk = require('stellar-sdk');
const trim = require('lodash/trim');
const _ = require('highland');
const server = new StellarSdk.Server('https://horizon.stellar.org');
const inflationTarget = process.argv[2] || 'GCCD6AJOYZCUAQLX32ZJF2MKFFAUJ53PVCFQI3RHWKL3V47QYE2BNAUT';
StellarSdk.Network.usePublicNetwork();

_(process.stdin)
  .split()
  .map((line) => {
    const parts = line.split(',');
    return {
      line: trim(parts[0], '"'),
      secret: trim(parts[1], '"')
    };
  })
  .filter(({line, secret}) => {
    if (!StellarSdk.StrKey.isValidEd25519SecretSeed(secret)) {
      console.log(`line ${line} doesn't contain valid stellar secret in column 2 `);
    }
    return StellarSdk.StrKey.isValidEd25519SecretSeed(secret);
  })
  .uniq()
  .map(({line, secret}) => {
    return {line: line, keypair: StellarSdk.Keypair.fromSecret(secret)};
  })
  .flatFilter(({line, keypair}) => {
    return _(server.loadAccount(keypair.publicKey())
        .then((acc) => {
          if (acc.inflation_destination === inflationTarget) {
            console.log(`${keypair.publicKey()} already has inflation destination set to ${inflationTarget}`);
            return false;
          }
          const tx = new StellarSdk.TransactionBuilder(acc)
            .addOperation(StellarSdk.Operation.setOptions({
              inflationDest: inflationTarget,
            }))
            .build();

          tx.sign(keypair);
          // console.log(tx.toEnvelope().toXDR().toString('base64'));
          return server.submitTransaction(tx);
        })
        .then((res) => {
          return !!res;
        })
        .catch((err) => {
          console.log(err);
          return false;
        })
    );
  })
  .map(({line, keypair}) => {
    return `updated ${keypair.publicKey()} on line ${line}\n`;
  })
  .pipe(process.stdout);
