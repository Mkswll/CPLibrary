/*

Mkswll's RollbackDSU class

Usage:
- use time() to record the timestamp
- time() - 1 is the last valid entry of hist

*/
struct RollbackDSU {
	int n;
	struct Node {
		int id, par, siz, rep;
	};
	vector<Node> d;
	vector<Node> hist; // history
	
	RollbackDSU(): n(0) {};
	RollbackDSU(int n_, int cap = 0): n{n_}, d(n_ + 1) {
		hist.reserve(cap + 1);
		for (int i = 1; i <= n; ++i) {
			d[i].id = i;
			d[i].par = i;
			d[i].siz = 1;
		}
	}
	
	Node &operator [](int x) { return d[find(x)]; }
	const Node &operator [](int x) const { return d[find(x)]; }
	
	int time() { return hist.size(); }
	
	int find(int x) const {
		return d[x].par == x ? x : find(d[x].par);
	}
	
	bool merge(int x, int y) {
		int px = find(x), py = find(y);
		if (px == py) return false;
		if (d[px].siz < d[py].siz) swap(px, py);
		hist.push_back(d[px]);
		hist.push_back(d[py]);
		d[py].par = px;
		d[px].siz += d[py].siz;
		d[px].rep = max(d[px].rep, d[py].rep);
		return true;
	}
	
	bool connected(int x, int y) {
		return find(x) == find(y);
	}
	
	void rollback(int t) {
		if (t >= hist.size()) return;
		for (int i = (int) hist.size() - 1; i >= t; --i) {
			d[hist[i].id] = hist[i];
		}
		hist.resize(t);
	}
};
