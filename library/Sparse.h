/*

Mkswll's SparseTable class

*/
template <typename T>
struct SparseTable {
	int n, up;
	vector<vector<T>> st;
	static inline vector<int> lg2{};

	void resize(int n_){
		lg2.assign(n_ + 1, 0);
		for (int i = 2; i <= n_; ++i) {
			lg2[i] = lg2[i >> 1] + 1;
		}
		up = lg2[n_];
		st.assign(n_ + 1, vector<T> (up + 1, T{}));
	}
	
	SparseTable(): n(0) {}
	SparseTable(int n_) {
		n = n_;
		resize(n_);
		init();
	}
	
	template <typename T2>
	SparseTable(int n_, T2& info_) {
		n = n_;
		resize(n_);
		for(int i = 1; i <= n; ++i){
			st[i][0] = T{info_[i]};
		}
		init();
	}
	
	void init() {
		for (int i = 1; i <= up; ++i) {
			int t = 1 << (i - 1);
			for (int j = 1; j + t <= n; ++j) {
				st[j][i] = st[j][i - 1] + st[j + t][i - 1];
			}
		}
	}
	
	T query(int l, int r) {
		int len = lg2[r - l + 1];
		return st[l][len] + st[r - (1 << len) + 1][len];
	}
};

struct Info {
	int mx = 0;
	
	Info() {}
	Info(auto x): mx{x} {}
};

Info operator +(const Info &a, const Info &b) {
	Info c;
	c.mx = max(a.mx, b.mx);
	return c;
}
