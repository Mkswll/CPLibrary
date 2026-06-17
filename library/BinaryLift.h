/*

Mkswll's BinaryLift class

Usage:
- import Graph first

*/
struct BinaryLift {
	int n, logh;
	Tree *t;
	vector<vector<int>> par;
	vector<int> dep;
	
	BinaryLift() {}
	BinaryLift(Tree &t_): n{t_.n}, logh{(int) log2(n)}, t{&t_}, 
		par(n + 1, vector<int>(logh + 1)),
		dep(n + 1) {
			
		init();
	}
	
	void dfs(int cur) {
		for (int i = 1; i <= logh; ++i) {
			par[cur][i] = par[par[cur][i - 1]][i - 1];
		}
		for (int to : (*t)[cur]) {
			if (to == par[cur][0]) continue;
			par[to][0] = cur;
			dep[to] = dep[cur] + 1;
			dfs(to);
		}
	}
	
	void init() {
		init(t->rt);
	}
	void init(int rt) {
		dfs(rt);
	}
	
	int lift(int x, int k) {
		if (!k) return x;
		for (int i = 0; i <= logh; ++i) {
			if (k >> i & 1) {
				x = par[x][i];
			}
		}
		return x;
	}
	
	int lca(int u, int v) {
		if (dep[u] < dep[v]) swap(u, v);
		u = lift(u, dep[u] - dep[v]);
		if (u == v) return u;
		for (int i = logh; ~i; --i) {
			if (par[u][i] == par[v][i]) continue;
			u = par[u][i];
			v = par[v][i];
		}
		return par[u][0];
	}
};