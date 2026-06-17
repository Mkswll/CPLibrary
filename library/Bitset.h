/*

Mkswll's Bitset class

*/
struct Bitset {
	using ull = unsigned long long;
	
	int n;
	vector<ull> b;
	
	Bitset(): n{0} {}
	
	Bitset(int _n) {
		n = _n / 64 + 1;
		b.assign(n, 0);
	}
	
	void set(int p) {
		b[p >> 6] |= 1ull << (p & 63);
	}
	
	bool get(int p) {
		return b[p >> 6] >> (p & 63) & 1;
	}
	
	int count() {
		int ret = 0;
		for (int i = 0; i < n; ++i) {
			ret += __builtin_popcountll(b[i]);
		}
		return ret;
	}
	
	void lshift() {
		ull carry = 0;
		for (int i = 0; i < n; ++i) {
			ull temp = carry;
			carry = b[i] >> 63 & 1;
			b[i] = (b[i] ^ (carry << 63)) << 1 | temp;
		}
	}
	
	friend Bitset operator &(Bitset lhs, Bitset rhs) {
		Bitset ret = lhs;
		for (int i = 0; i < ret.n; ++i) {
			ret.b[i] &= rhs.b[i];
		}
		return ret;
	}
	
	friend Bitset operator |(Bitset lhs, Bitset rhs) {
		Bitset ret = lhs;
		for (int i = 0; i < ret.n; ++i) {
			ret.b[i] |= rhs.b[i];
		}
		return ret;
	}
	
	friend Bitset operator ^(Bitset lhs, Bitset rhs) {
		Bitset ret = lhs;
		for (int i = 0; i < ret.n; ++i) {
			ret.b[i] ^= rhs.b[i];
		}
		return ret;
	}
	
	friend Bitset operator -(Bitset lhs, Bitset& rhs) {
		Bitset ret = lhs;
		ull carry = 0;
		for (int i = 0; i < ret.n; ++i) {
			ret.b[i] -= rhs.b[i] + carry;
			carry = (lhs.b[i] < rhs.b[i] + carry);
		}
		return ret;
	}
};
