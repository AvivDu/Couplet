// @ts-ignore - untyped deep import; must be src/, the exact module enhance-rn.js patches
import BigInteger from 'amazon-cognito-identity-js/src/BigInteger';

// Cognito's PASSWORD_VERIFIER challenge expires 30s after it is issued (measured:
// a 29s delay authenticates, 31s returns NotAuthorizedException - the same error as
// a wrong password, which is what made this so hard to identify).
//
// amazon-cognito-identity-js computes S with jsbn, a pure-JS bignum library, because
// its native accelerator (RNAWSCognito, wired up in enhance-rn.js) needs a custom dev
// client that this project deliberately doesn't have. Under Hermes those two 3072-bit
// modPow calls took ~31s on Android and ~13s on iOS - so Android answered after the
// challenge had already expired and iOS did not. Same code, same credentials, same
// clock; only the CPU differed.
//
// Hermes supports native BigInt, which does the same arithmetic in well under a
// second. This swaps jsbn's modPow for a BigInt implementation, matching the original
// exactly (verified against jsbn on SRP-sized operands, including the negative base
// that arises from B - k*g^x) and falling back to jsbn for anything unexpected.

let installed = false;

function toBigInt(value: any): bigint {
  const hex = value.toString(16);
  return hex.charAt(0) === '-' ? -BigInt(`0x${hex.slice(1)}`) : BigInt(`0x${hex}`);
}

export function installFastSrpMath(): void {
  if (installed) return;
  if (typeof BigInt === 'undefined') return; // engine without BigInt: keep jsbn
  installed = true;

  const proto: any = (BigInteger as any).prototype;
  const originalModPow = proto.modPow;

  proto.modPow = function fastModPow(e: any, m: any, callback: (err: any, result: any) => void) {
    try {
      const mod = toBigInt(m);
      let exp = toBigInt(e);
      // jsbn owns these edge cases; SRP never hits them.
      if (mod <= 0n || exp < 0n) return originalModPow.call(this, e, m, callback);

      let base = toBigInt(this) % mod;
      if (base < 0n) base += mod; // B - k*g^x can be negative

      let result = 1n;
      while (exp > 0n) {
        if (exp & 1n) result = (result * base) % mod;
        base = (base * base) % mod;
        exp >>= 1n;
      }
      return callback(null, new (BigInteger as any)(result.toString(16), 16));
    } catch {
      return originalModPow.call(this, e, m, callback);
    }
  };
}
