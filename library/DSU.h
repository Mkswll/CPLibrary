/*

Mkswll's DSU class

*/
struct DSU {
	int n;
	struct Node {
		int par, siz;
	};
	vector<Node> d;
	
	DSU(): n(0) {}
	DSU(int n_): n{n_}, d(n_ + 1) {
		for (int i = 1; i <= n; ++i) {
			d[i].par = i;
			d[i].siz = 1;
		}
	}
	
	Node &operator [](int x) { return d[find(x)]; }
	
	int find(int x) {
		return d[x].par == x ? x : d[x].par = find(d[x].par);
	}
	
	bool merge(int x, int y){
		int px = find(x), py = find(y);
		if (px == py) return false;
		if (d[px].siz < d[py].siz) swap(px, py);
		d[py].par = px;
		d[px].siz += d[py].siz;
		return true;
	}
	
	bool connected(int x, int y) {
		return find(x) == find(y);
	}
};
