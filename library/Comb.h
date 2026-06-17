template <typename T>
struct Comb {
	int n, cap; // last computed value is n, array sizes are cap
	
	vector<T> fac, ifac;
	
	Comb(): n{0}, cap{1}, fac{1}, ifac{1} {}
	
	Comb(int n_): n{0}, cap{n_ + 1}, fac(n_ + 1), ifac(n_ + 1) {
		fac[0] = ifac[0] = 1;
		init(n_);
	}
	
	void init(int n_) {
		if (n_ <= n) return;
		if (n_ >= cap) {
			while (n_ >= cap) cap <<= 1;
			fac.resize(cap);
			ifac.resize(cap);
		}
		for (int i = n + 1; i <= n_; ++i) fac[i] = fac[i - 1] * i;
		ifac[n_] = 1 / fac[n_];
		for (int i = n_ - 1; i > n; --i) ifac[i] = ifac[i + 1] * (i + 1);
		n = n_;
	}
	
	T choose(int p, int q) {
		assert(q >= 0);
		if (p < q) return 0;
		if (p > n) init(p);
		return fac[p] * ifac[q] * ifac[p - q];
	}
	
	T perm(int p, int q) {
		assert(q >= 0);
		if (p < q) return 0;
		if (p > n) init(p);
		return fac[p] * ifac[p - q];
	}
};

Comb<Mint> comb;
