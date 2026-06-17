/*

Mkswll's XorBasis class

*/
template <typename T, int LIM = 30>
struct XorBasis {
	array<T, LIM + 1> basis {};
	
	XorBasis() {}
	
	void insert(T x) {
		while (x) {
			int hb = 63 - __builtin_clzll(x); // change to int as needed
			// int hb = 31 - __builtin_clz(x);
			if (!basis[hb]) {
				basis[hb] = x;
				return;
			}
			x ^= basis[hb];
		}
	}
	
	void merge(XorBasis& t) {
		for (int i = 0; i <= LIM; ++i) {
			if (t.basis[i]) insert(t.basis[i]);
		}
	}
	
	ll qmax(ll ans = 0) {
		for (int i = LIM; ~i; --i) {
			if (!basis[i]) continue;
			if (ans >> i & 1) continue;
			ans ^= basis[i];
		}
		return ans;
	}
	
	T rank(T x) {
		int rk = 0;
		T t = 1;
		for (int i = 0; i <= LIM; ++i) {
			if (basis[i]) {
				if (x >> i & 1) rk += t;
				t <<= 1;
			}
		}
		return rk; // 0-indexed
	}
	
	T kth(T k) {
		vector<int> bits;
		for (int i = LIM; ~i; --i) {
			if (basis[i]) bits.pb(i);
		}
		int len = bits.size();
		if (k >= (1 << len)) return -1; // not enough elements
		T ret = 0;
		for (int i = 0; i < len; ++i) {
			if ((k >> (len - i + 1) & 1) ^ (ret >> bits[i] & 1)) {
				ret ^= basis[bits[i]];
			}
		}
		return ret;
	}
	
	bool contains(T x){
		for (int i = LIM; ~i; --i) {
			if (x >> i & 1) {
				x ^= basis[i];
			}
		}
		return !x;
	}
};
