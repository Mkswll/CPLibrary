/*

Mkswll's SegTree class, inspired by jiangly's SegmentTree

Assumptions:
- everything is 1-indexed and closed on both ends, including queries
- find_first, find_last assume that if pred(t[cur]), then all parents of cur satisfies pred, and some leaf under cur satisfies pred

Usage:
- change Info class only!

*/
template <typename T>
struct SegTree {
	int n;
	vector<T> t;
	
	SegTree(): n{0} {}
	SegTree(int n_, T v_ = T{}) {
		init(n_, v_);
	}
	template <typename T2>
	SegTree(int n_, const T2 &info_, bool one_indexed = true) {
		vector<T> info(n_ + 1);
		for (int i = 1; i <= n_; ++i) info[i] = info_[i - !one_indexed];
		init(info);
	}
	
	void init(int n_, T v_ = T{}) {
		init(vector<T>(n_, v_), false);
	}
	template <typename T2>
	void init(int n_, const T2 &info_, bool one_indexed = true) {
		vector<T> info(n_ + 1);
		for (int i = 1; i <= n_; ++i) info[i] = info_[i - !one_indexed];
		init(info);
	}
	
	void init(const vector<T> &info, bool one_indexed = true) {
		n = info.size() - one_indexed;
		if (!n) return;
		t.assign(4 << __lg(n), T{});
		auto build = [&](auto &&self, int cur, int l, int r) -> void {
			if (l == r) {
				t[cur] = T{info[l - !one_indexed]};
				return;
			}
			int mid = (l + r) >> 1;
			self(self, cur << 1, l, mid);
			self(self, cur << 1 | 1, mid + 1, r);
			push_up(cur);
		};
		build(build, 1, 1, n);
	}
	
	void push_up(int cur) {
		t[cur] = t[cur << 1] + t[cur << 1 | 1];
	}
	
	template <typename T2> 
	void update(int q, const T2 &val) {
		update(1, 1, n, q, val);
	}
	template <typename T2>
	void update(int cur, int l, int r, int q, const T2 &val) {
		if (l > q || r < q) return;
		if (l == r) {
			t[cur].update(val, l, r);
			return;
		}
		int mid = (l + r) >> 1;
		update(cur << 1, l, mid, q, val);
		update(cur << 1 | 1, mid + 1, r, q, val);
		push_up(cur);
	}
	
	
	T query(int ql, int qr) {
		return query(1, 1, n, ql, qr);
	}
	T query(int cur, int l, int r, int ql, int qr) {
		if (l > qr || r < ql) return T{};
		if (l >= ql && r <= qr) return t[cur];
		int mid = (l + r) >> 1;
		return query(cur << 1, l, mid, ql, qr) + query(cur << 1 | 1, mid + 1, r, ql, qr);
	}
	
	template <typename F>
	int find_first(int ql, int qr, F &&pred) {
		return find_first(1, 1, n, ql, qr, pred);
	}
	template <typename F>
	int find_first(int cur, int l, int r, int ql, int qr, F &&pred) {
		if (l > qr || r < ql) return -1;
		if (l >= ql && r <= qr && !pred(t[cur])) return -1;
		if (l == r) return pred(t[cur]) ? l : -1;
		int mid = (l + r) >> 1;
		int lres = find_first(cur << 1, l, mid, ql, qr, pred);
		if (lres != -1) return lres;
		return find_first(cur << 1 | 1, mid + 1, r, ql, qr, pred);
	}
	
	template <typename F>
	int find_last(int ql, int qr, F &&pred) {
		return find_last(1, 1, n, ql, qr, pred);
	}
	template <typename F>
	int find_last(int cur, int l, int r, int ql, int qr, F &&pred) {
		if (l > qr || r < ql) return -1;
		if (l >= ql && r <= qr && !pred(t[cur])) return -1;
		if (l == r) return pred(t[cur]) ? l : -1;
		int mid = (l + r) >> 1;
		int rres = find_last(cur << 1 | 1, mid + 1, r, ql, qr, pred);
		if (rres != -1) return rres;
		return find_last(cur << 1, l, mid, ql, qr, pred);
	}
};

struct Info {
	long long sm = 0;
	
	template <typename T2> 
	void update(const T2 &val, int l = 0, int r = 0) {
		sm += val;
	}
	
	Info() {}
	Info(auto x): sm{x} {}
};

Info operator +(const Info &a, const Info &b) {
	Info c;
	c.sm = a.sm + b.sm;
	return c;
}
